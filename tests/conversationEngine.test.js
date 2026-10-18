// Comprehensive Evaluation Suite for DigiDoc Context-Aware Conversation Engine
// Testing Scenarios A through L as specified in Section 12 of the Master Prompt

import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationEngine } from '../src/services/conversationEngine.js';
import { ClinicalState } from '../src/services/clinicalState.js';
import { SafetyLayer } from '../src/services/safetyLayer.js';
import { ReportParser } from '../src/services/reportParser.js';
import { MedicalRoutingPipeline } from '../src/services/medicalRoutingPipeline.js';
import { SpeechService } from '../src/services/speechService.js';

test('Scenario A: Context retention across multiple turns without repeating questions', () => {
  const engine = new ConversationEngine();

  // Turn 1: Patient reports headache
  const res1 = engine.generateLocalResponse("I've had a headache since yesterday.");
  const state1 = engine.getState();
  assert.equal(state1.symptoms.has('headache'), true, 'Should track headache');
  assert.equal(state1.symptoms.get('headache').duration, 'since yesterday', 'Should record duration');
  // DigiDoc asks for location
  assert.equal(state1.questionsAsked.some(q => q.id === 'location'), true, 'Should ask for location');

  // Turn 2: Patient gives location
  const res2 = engine.generateLocalResponse("Mostly on the right side.");
  const state2 = engine.getState();
  assert.equal(state2.symptoms.get('headache').location, 'right side', 'Should record location as right side');
  assert.equal(state2.questionsAnswered.some(q => q.id === 'location'), true, 'Location question should be answered');
  // DigiDoc asks for character (throbbing vs pressure)
  assert.equal(state2.questionsAsked.some(q => q.id === 'character'), true, 'Should ask for character');

  // Turn 3: Patient gives character
  const res3 = engine.generateLocalResponse("Throbbing pain.");
  const state3 = engine.getState();
  assert.equal(state3.symptoms.get('headache').character, 'throbbing', 'Should record character as throbbing');

  // Verify DigiDoc NEVER asks for duration or location again
  const askedIds = state3.questionsAsked.map(q => q.id);
  const locationCount = askedIds.filter(id => id === 'location').length;
  const durationCount = askedIds.filter(id => id === 'duration').length;
  assert.equal(locationCount, 1, 'Location question must be asked at most once');
  assert.equal(durationCount, 0, 'Duration was already provided in Turn 1, so duration must never be asked');
});

test('Scenario B: Changing / evolving symptoms incorporated into existing episode', () => {
  const engine = new ConversationEngine();

  // Turn 1: Headache
  engine.generateLocalResponse("I have a severe headache.");
  assert.equal(engine.getState().symptoms.has('severe_headache') || engine.getState().symptoms.has('headache'), true);

  // Turn 2: Patient mentions nausea belongs to the same episode
  engine.generateLocalResponse("And I feel a little nauseated.");
  const state = engine.getState();

  assert.equal(state.symptoms.has('severe_headache') || state.symptoms.has('headache'), true, 'Must retain headache');
  assert.equal(state.symptoms.has('nausea'), true, 'Must incorporate nausea into the same episode');
  assert.equal(state.symptoms.size, 2, 'Both symptoms must be active');
  assert.equal(state.routing.specialtyId, 'neurologist', 'Headache + nausea should suggest Neurologist');
});

test('Scenario C: Correcting information updates state immediately', () => {
  const engine = new ConversationEngine();

  // Turn 1: Initial statement
  engine.generateLocalResponse("I have pain on my left side.");
  const sym1 = Array.from(engine.getState().symptoms.values())[0];
  assert.equal(sym1.location, 'left side', 'Initial location should be left side');

  // Turn 2: Correction
  engine.generateLocalResponse("Actually not left side, it's on the right side.");
  const sym2 = Array.from(engine.getState().symptoms.values())[0];
  assert.equal(sym2.location, 'right side', 'Corrected location must be right side');
  assert.equal(engine.getState().corrections.length > 0, true, 'Correction log should record the change');
  assert.equal(engine.getState().corrections[0].newValue, 'right side', 'Correction log should capture right side');
});

test('Scenario D: Topic changes handled smoothly without losing active medical context', () => {
  const engine = new ConversationEngine();

  // Turn 1: Medical concern
  engine.generateLocalResponse("I have had a high fever for two days.");
  assert.equal(engine.getState().symptoms.has('high_fever') || engine.getState().symptoms.has('fever'), true);

  // Turn 2: Unrelated topic / question about panadol
  const res2 = engine.generateLocalResponse("Can I take Panadol for it?");
  assert.equal(engine.getState().activeTopic, 'medication_inquiry', 'Should detect medication inquiry');
  assert.match(res2.rawText, /paracetamol|panadol/i, 'Response should address panadol');

  // Verify original symptom context is preserved
  assert.equal(engine.getState().symptoms.size > 0, true, 'Active symptom context must remain intact');
  assert.equal(engine.getState().chiefComplaint !== null, true, 'Chief complaint must be retained');
});

test('Scenario E: Incomplete information triggers focused inquiry instead of premature assertion', () => {
  const engine = new ConversationEngine();

  // Patient says only "My stomach hurts"
  const res = engine.generateLocalResponse("My stomach hurts.");
  const state = engine.getState();

  assert.equal(state.symptoms.has('abdominal_pain'), true, 'Should detect abdominal pain');
  assert.equal(state.hasSufficientClinicalInformation(), false, 'Should recognize information is incomplete');
  // It must ask a clarifying question (duration or location) and not jump to a final diagnosis
  assert.equal(state.questionsAsked.length >= 1, true, 'Should ask a focused follow-up question');
  assert.doesNotMatch(res.rawText, /definitive diagnosis|you definitely have appendicitis/i, 'Must not claim definitive diagnosis');
});

test('Scenario F: Uploaded lab report extracted accurately and matched against clinical ranges', () => {
  const parser = new ReportParser();

  const reportText = `Patient Lab Report:
Fasting Blood Sugar: 185 mg/dL
HbA1c: 8.5 %
Serum Creatinine: 1.1 mg/dL`;

  const results = parser.parseReportText(reportText, { age: 45, sex: 'female' });
  assert.equal(results.length, 3, 'Should extract all 3 lab parameters');

  const fbs = results.find(r => r.testId === 'glucose_fasting');
  assert.equal(fbs.value, 185);
  assert.equal(fbs.status, 'high');
  assert.match(fbs.gradeNote, /DIABETES/i, 'Should identify diabetes grade from reference ranges');

  const explanation = parser.formatExplanation(results, 'en');
  assert.match(explanation, /Fasting Blood Sugar/i);
  assert.match(explanation, /HIGH/i);
});

test('Scenario G: Emergency symptoms trigger immediate safety escalation without delays', () => {
  const safety = new SafetyLayer();

  // Severe acute chest pain with sweating
  const check = safety.evaluate("I have severe crushing chest pain radiating to my left arm and cold sweat.");
  assert.equal(check.isUrgent, true, 'Must identify urgent emergency');
  assert.equal(check.tier, 1, 'Must be Tier 1');
  assert.equal(check.redFlags.length > 0, true, 'Must list red flags');
  assert.match(check.emergencyGuidance.rawText, /1122/, 'Must include Rescue 1122');
  assert.match(check.emergencyGuidance.rawText, /ALERT_URGENT/, 'Must include ALERT_URGENT tag');
  assert.equal(check.emergencyGuidance.primaryTag, 'ALERT_URGENT');
});

test('Scenario H: Language switching between English, Urdu script, and Roman Urdu preserves context', () => {
  const engine = new ConversationEngine();

  // Turn 1 in English
  engine.generateLocalResponse("I have a persistent cough since last week.");
  assert.equal(engine.getState().language, 'en', 'Should detect English');

  // Turn 2 in Roman Urdu
  engine.generateLocalResponse("Mujhe halka bukhar bhi hai.");
  assert.equal(engine.getState().language, 'rur', 'Should detect Roman Urdu');
  assert.equal(engine.getState().symptoms.has('fever'), true, 'Should retain previous cough and add fever');
  assert.equal(engine.getState().symptoms.size, 2, 'Both cough and fever present');

  // Turn 3 in Urdu script
  engine.generateLocalResponse("کیا یہ نمونیا ہو سکتا ہے؟");
  assert.equal(engine.getState().language, 'ur', 'Should detect Urdu script');
  assert.equal(engine.getState().symptoms.size, 2, 'Symptoms still preserved across language switches');
});

test('Scenario I: Long conversation maintains core structured clinical state', () => {
  const engine = new ConversationEngine();

  // Simulate 6 turns of dialogue
  engine.generateLocalResponse("I have back pain.");
  engine.generateLocalResponse("It started 5 days ago.");
  engine.generateLocalResponse("The pain is on the lower back.");
  engine.generateLocalResponse("It feels dull and aching.");
  engine.generateLocalResponse("No fever at all.");
  engine.generateLocalResponse("Does hot water fomentation help?");

  const state = engine.getState();
  assert.equal(state.turnCount, 6, 'Should count 6 turns');
  assert.equal(state.pertinentNegatives.has('fever'), true, 'Pertinent negative fever should be remembered');
  assert.equal(state.symptoms.has('flank_pain') || state.symptoms.has('body_ache'), true, 'Back pain should remain in state');
  
  const summaryStr = state.toClinicalSummaryString();
  assert.match(summaryStr, /STRUCTURED CLINICAL SESSION CONTEXT/);
  assert.match(summaryStr, /Turn: #6/);
});

test('Scenario J: Contradictory information handling and clarification', () => {
  const state = new ClinicalState();

  // Patient first mentions having symptoms for 2 days
  state.recordSymptom({ id: 'cough', name: { en: 'Cough', ur: 'کھانسی', rur: 'Khansi' } }, { duration: '2 days' });
  assert.equal(state.symptoms.get('cough').duration, '2 days');

  // Later states it has been 3 weeks
  state.recordSymptom({ id: 'cough', name: { en: 'Cough', ur: 'کھانسی', rur: 'Khansi' } }, { duration: '3 weeks' });
  assert.equal(state.symptoms.get('cough').duration, '3 weeks');
  assert.equal(state.corrections.length, 1, 'Should log contradiction/correction');
  assert.equal(state.corrections[0].previousValue, '2 days');
  assert.equal(state.corrections[0].newValue, '3 weeks');
});

test('Scenario K: Ambiguous or non-clinical query handled with honest clarification', () => {
  const engine = new ConversationEngine();

  const res = engine.generateLocalResponse("xyz qwerty blurp 1234");
  assert.match(res.rawText, /wazeh|detail|sun raha hoon|describe/i, 'Should request clarification politely');
  assert.equal(res.primaryTag, 'LISTENING_ATTENTIVE');
});

test('Scenario L: Voice interruption cancels active response and accepts new input', () => {
  const speech = new SpeechService();
  let interruptedFired = false;

  speech.onInterrupted = () => {
    interruptedFired = true;
  };

  speech.isSpeaking = true;
  speech.isProcessing = true;

  // User speaks while assistant is speaking -> trigger interruption
  speech.handleInterruption();

  assert.equal(speech.isSpeaking, false, 'Speech should be cancelled');
  assert.equal(speech.isProcessing, false, 'Processing should be reset');
  assert.equal(interruptedFired, true, 'Interruption callback should be fired');
});

test('Teammate API Compatibility: clinicalState and clinicalEngine standalone functions', async () => {
  const { clinicalState, update, getState, reset } = await import('../src/services/clinicalState.js');
  const { clinicalEngine } = await import('../src/services/clinicalEngine.js');

  reset();
  const updatedState = update('Mujhe 3 din se tez bukhar hai aur dard barh raha hai.');
  assert.equal(updatedState.turnCount, 1);
  assert.equal(updatedState.accumulatedSymptoms.length >= 1, true);
  assert.equal(updatedState.severityTrajectory, 'escalating');
  assert.equal(updatedState.triageTier <= 2, true, 'Escalating symptoms should trigger urgent tier');

  const retrievedState = getState();
  assert.equal(retrievedState.turnCount, 1);

  // ClinicalEngine compatibility
  const detected = clinicalEngine.detectSymptoms('khansi aur bukhar');
  assert.equal(detected.length >= 2, true);

  const followUp = clinicalEngine.formulateAdaptiveFollowUp();
  assert.equal(typeof followUp.text, 'string');
  assert.equal(typeof followUp.cleanSpeechText, 'string');

  const engineRes = clinicalEngine.generateResponse('bukhar hai');
  assert.equal(typeof engineRes.rawText, 'string');
});
