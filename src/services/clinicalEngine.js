// DigiDoc Clinical Engine (Intelligent, Context-Aware Clinical Core)
// Fully compatible with teammate's ClinicalEngine API and conversationEngine

import diseasesData from '../data/diseases_conditions.json' with { type: 'json' };
import quettaDoctors from '../data/quetta_doctors.json' with { type: 'json' };
import labRangesData from '../data/lab_reference_ranges.json' with { type: 'json' };
import { clinicalState } from './clinicalState.js';
import { conversationEngine } from './conversationEngine.js';
import { medicalRoutingPipeline } from './medicalRoutingPipeline.js';

export class ClinicalEngine {
  constructor() {
    this.clinicalState = clinicalState;
    this.symptomsList = this.clinicalState.symptomsList || diseasesData.symptoms || [];
    this.conditionsList = diseasesData.conditions || [];
    this.specialtiesMap = diseasesData.specialties || {};
    this.doctors = quettaDoctors || [];
    this.tests = labRangesData.tests || [];
    this.conversationTurn = 0;
  }

  /**
   * Reset conversation turn and underlying ClinicalStateManager / ConversationEngine.
   */
  reset() {
    this.conversationTurn = 0;
    this.clinicalState.reset();
    conversationEngine.reset();
  }

  /**
   * Retrieve current clinical state.
   */
  getState() {
    return this.clinicalState.getState();
  }

  /**
   * Multilingual Symptom Matcher across Urdu script, Roman Urdu, and English.
   */
  detectSymptoms(text) {
    const { detected } = medicalRoutingPipeline.extractSymptomsWithNegation(text);
    return detected;
  }

  /**
   * Predict differential conditions using noisy-OR probability calculation.
   */
  predictConditions(matchedSymptoms) {
    if (!matchedSymptoms || matchedSymptoms.length === 0) return [];

    const symptomsMap = new Map();
    for (const sym of matchedSymptoms) {
      symptomsMap.set(sym.id, sym);
    }

    return medicalRoutingPipeline.evaluateDifferentials(symptomsMap);
  }

  /**
   * Find Quetta Doctor by specialty.
   */
  findQuettaDoctor(specialtyKey) {
    return medicalRoutingPipeline.findQuettaDoctor(specialtyKey);
  }

  /**
   * Non-Repetitive Adaptive Follow-up Formulator.
   */
  formulateAdaptiveFollowUp(state = null) {
    const currentState = state || this.clinicalState.getState();
    const differentials = currentState.differentialConditions || [];
    const accumulatedIds = new Set((currentState.accumulatedSymptoms || []).map(s => s.id));
    const deniedIds = new Set(currentState.deniedSymptoms || []);
    const knownIds = new Set([...accumulatedIds, ...deniedIds]);

    if (differentials.length >= 2) {
      const cond1 = differentials[0].condition;
      const cond2 = differentials[1].condition;

      const cond1Unique = (cond1.symptoms || [])
        .filter(s1 => !cond2.symptoms?.some(s2 => s2.id === s1.id))
        .map(s => this.symptomsList.find(sym => sym.id === s.id))
        .filter(sym => sym && !knownIds.has(sym.id));

      const cond2Unique = (cond2.symptoms || [])
        .filter(s2 => !cond1.symptoms?.some(s1 => s1.id === s2.id))
        .map(s => this.symptomsList.find(sym => sym.id === s.id))
        .filter(sym => sym && !knownIds.has(sym.id));

      if (cond1Unique.length > 0 && cond2Unique.length > 0) {
        const s1 = cond1Unique[0];
        const s2 = cond2Unique[0];
        const qId = `diff_${cond1.id}_${s1.id}_vs_${cond2.id}_${s2.id}`;

        if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
          this.clinicalState.markQuestionAsked(qId);
          const s1Name = s1.name?.rur || s1.name?.en;
          const s2Name = s2.name?.rur || s2.name?.en;
          return {
            text: `Tashkhees ko wazeh karne ke liye: Kya aapko **${s1Name}** mehsoos ho raha hai, ya phir **${s2Name}** jaisi alamat hai?`,
            cleanSpeechText: `Tashkhees ke liye: Kya aapko ${s1Name} hai ya phir ${s2Name} hai?`
          };
        }
      }

      if (cond1Unique.length > 0) {
        const s1 = cond1Unique[0];
        const qId = `sym_cond1_${cond1.id}_${s1.id}`;
        if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
          this.clinicalState.markQuestionAsked(qId);
          const s1Name = s1.name?.rur || s1.name?.en;
          return {
            text: `Kya is takleef ke sath aapko **${s1Name}** bhi mehsoos ho rahi hai?`,
            cleanSpeechText: `Kya is takleef ke sath aapko ${s1Name} bhi mehsoos ho rahi hai?`
          };
        }
      }
    }

    // Default open check-in
    return {
      text: 'Apni takleef ke baray mein mazeed wazeh karein taakay behtar rehnumayi ki ja sakay.',
      cleanSpeechText: 'Apni takleef ke baray mein mazeed wazeh karein.'
    };
  }

  /**
   * Generate dynamic, context-aware clinical response (delegates to conversationEngine).
   */
  generateResponse(userMessage) {
    this.conversationTurn++;
    this.clinicalState.update(userMessage);
    return conversationEngine.generateLocalResponse(userMessage);
  }
}

export const clinicalEngine = new ClinicalEngine();
export default clinicalEngine;
