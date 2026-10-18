import diseasesData from '../data/diseases_conditions.json';
import quettaDoctors from '../data/quetta_doctors.json';
import labRangesData from '../data/lab_reference_ranges.json';
import { clinicalState, ClinicalStateManager } from './clinicalState';

export class ClinicalEngine {
  constructor() {
    this.symptomsList = diseasesData.symptoms || [];
    this.conditionsList = diseasesData.conditions || [];
    this.specialtiesMap = diseasesData.specialties || {};
    this.doctors = quettaDoctors || [];
    this.tests = labRangesData.tests || [];
    this.conversationTurn = 0;
    this.clinicalState = clinicalState;
  }

  /**
   * Reset conversation turn and underlying ClinicalStateManager.
   */
  reset() {
    this.conversationTurn = 0;
    this.clinicalState.reset();
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
    const { confirmed } = this.clinicalState.extractSymptomsWithNegation(text);
    return confirmed;
  }

  /**
   * Match condition from detected symptoms with noisy-OR calculation.
   */
  predictConditions(matchedSymptoms) {
    return this.clinicalState.calculateDifferentialConditions(matchedSymptoms, []);
  }

  /**
   * Find Quetta Doctor by specialty.
   */
  findQuettaDoctor(specialtyKey) {
    const specInfo = this.specialtiesMap[specialtyKey];
    const specEn = specInfo?.en?.toLowerCase() || '';

    const matched = this.doctors.find(d => {
      const primary = d.primarySpecialty?.toLowerCase() || '';
      return primary.includes(specEn) || (specEn && primary.includes(specEn.split(' ')[0]));
    });

    return matched || this.doctors[0];
  }

  /**
   * Non-Repetitive Adaptive Follow-up Formulator.
   * Compares top 2 differential conditions, picks distinguishing unasked symptoms,
   * condition-specific follow-ups, or safety checks.
   * Ensures DigiDoc NEVER asks the same question twice!
   */
  formulateAdaptiveFollowUp(state) {
    const differentials = state.differentialConditions || [];
    const accumulatedIds = new Set(state.accumulatedSymptoms.map(s => s.id));
    const deniedIds = new Set(state.deniedSymptoms || []);
    const knownIds = new Set([...accumulatedIds, ...deniedIds]);

    // 1. Differentiate between Top 2 Conditions if available
    if (differentials.length >= 2) {
      const cond1 = differentials[0].condition;
      const cond2 = differentials[1].condition;

      // Symptoms unique to Cond 1 (not in Cond 2 and not yet asked/known)
      const cond1Unique = (cond1.symptoms || [])
        .filter(s1 => !cond2.symptoms?.some(s2 => s2.id === s1.id))
        .map(s => this.symptomsList.find(sym => sym.id === s.id))
        .filter(sym => sym && !knownIds.has(sym.id));

      // Symptoms unique to Cond 2 (not in Cond 1 and not yet asked/known)
      const cond2Unique = (cond2.symptoms || [])
        .filter(s2 => !cond1.symptoms?.some(s1 => s1.id === s2.id))
        .map(s => this.symptomsList.find(sym => sym.id === s.id))
        .filter(sym => sym && !knownIds.has(sym.id));

      // Strategy A: Direct distinguishing pair question
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

      // Strategy B: Distinguishing symptom for Cond 1
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

      // Strategy C: Distinguishing symptom for Cond 2
      if (cond2Unique.length > 0) {
        const s2 = cond2Unique[0];
        const qId = `sym_cond2_${cond2.id}_${s2.id}`;
        if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
          this.clinicalState.markQuestionAsked(qId);
          const s2Name = s2.name?.rur || s2.name?.en;
          return {
            text: `Kya aapko **${s2Name}** ki alamat bhi hai?`,
            cleanSpeechText: `Kya aapko ${s2Name} ki alamat bhi hai?`
          };
        }
      }

      // Strategy D: Condition-specific follow-up questions from knowledge base
      if (cond1.follow_up_questions && cond1.follow_up_questions.length > 0) {
        for (let i = 0; i < cond1.follow_up_questions.length; i++) {
          const qId = `cond_kb_${cond1.id}_${i}`;
          if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
            this.clinicalState.markQuestionAsked(qId);
            const qText = cond1.follow_up_questions[i];
            return {
              text: `Baraye meharbani batayein: ${qText}`,
              cleanSpeechText: qText
            };
          }
        }
      }

      if (cond2.follow_up_questions && cond2.follow_up_questions.length > 0) {
        for (let i = 0; i < cond2.follow_up_questions.length; i++) {
          const qId = `cond_kb_${cond2.id}_${i}`;
          if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
            this.clinicalState.markQuestionAsked(qId);
            const qText = cond2.follow_up_questions[i];
            return {
              text: `Baraye meharbani batayein: ${qText}`,
              cleanSpeechText: qText
            };
          }
        }
      }
    }

    // 2. Single Condition Follow-ups if only 1 condition matched
    if (differentials.length === 1) {
      const topCond = differentials[0].condition;
      const unaskedSym = (topCond.symptoms || [])
        .map(s => this.symptomsList.find(sym => sym.id === s.id))
        .filter(sym => sym && !knownIds.has(sym.id));

      if (unaskedSym.length > 0) {
        const nextSym = unaskedSym[0];
        const qId = `sym_single_${topCond.id}_${nextSym.id}`;
        if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
          this.clinicalState.markQuestionAsked(qId);
          const symName = nextSym.name?.rur || nextSym.name?.en;
          return {
            text: `Kya is ke sath aapko **${symName}** ki takleef bhi hai?`,
            cleanSpeechText: `Kya is ke sath aapko ${symName} ki takleef bhi hai?`
          };
        }
      }

      if (topCond.follow_up_questions && topCond.follow_up_questions.length > 0) {
        for (let i = 0; i < topCond.follow_up_questions.length; i++) {
          const qId = `cond_kb_${topCond.id}_${i}`;
          if (!this.clinicalState.hasQuestionBeenAsked(qId)) {
            this.clinicalState.markQuestionAsked(qId);
            const qText = topCond.follow_up_questions[i];
            return {
              text: `Baraye meharbani batayein: ${qText}`,
              cleanSpeechText: qText
            };
          }
        }
      }
    }

    // 3. Fallback Adaptive Questions (Strictly checked against askedQuestionIds)
    const fallbackOptions = [
      {
        id: 'timeline_duration_inquiry',
        condition: !state.timeline?.duration,
        text: 'Yeh takleef aapko kitne din ya ghanton se hai, aur kya kisi dawa se thora sukoon mila?',
        cleanSpeechText: 'Yeh takleef aapko kitne arsay se hai aur kya koi dawa li hai?'
      },
      {
        id: 'vulnerable_chronic_history',
        condition: true,
        text: 'Kya aapko pehle se koi purani bimari (jaise Sugar, Blood Pressure, ya Asthma/Dama) hai?',
        cleanSpeechText: 'Kya aapko pehle se sugar ya blood pressure ki bimari hai?'
      },
      {
        id: 'red_flag_safety_screen',
        condition: true,
        text: 'Kya is takleef ke sath saans lene mein dushwari, seene mein jakran, ya ulti mein khoon jaisi koi aur takleef mehsoos hui?',
        cleanSpeechText: 'Kya saans lene mein dushwari ya seene mein jakran mehsoos hui?'
      },
      {
        id: 'medication_allergy_check',
        condition: true,
        text: 'Kya aap is takleef ke liye koi dawa le rahe hain ya aapko kisi medicine se allergy hai?',
        cleanSpeechText: 'Kya aap koi dawa le rahe hain ya kisi medicine se allergy hai?'
      }
    ];

    for (const opt of fallbackOptions) {
      if (opt.condition && !this.clinicalState.hasQuestionBeenAsked(opt.id)) {
        this.clinicalState.markQuestionAsked(opt.id);
        return {
          text: opt.text,
          cleanSpeechText: opt.cleanSpeechText
        };
      }
    }

    // Default general follow-up if all specific questions have been exhausted
    return {
      text: 'Apni takleef mein aane wali kisi bhi mazeed tabdeeli ya naye alamat ke baray mein batayein.',
      cleanSpeechText: 'Apni takleef mein aane wali kisi bhi tabdeeli ke baray mein batayein.'
    };
  }

  /**
   * Generate intelligent Pakistani Clinical Response integrated with ClinicalStateManager.
   */
  generateResponse(userMessage) {
    this.conversationTurn++;
    const text = (userMessage || '').toLowerCase().trim();

    // 1. Update multi-turn clinical state
    const state = this.clinicalState.update(userMessage);

    // 2. Handle Lab Biomarkers & Report Queries
    if (text.includes('sugar') || text.includes('شوگر') || text.includes('fbs') ||
        text.includes('hba1c') || text.includes('creatinine') || text.includes('cbc') ||
        text.includes('platelets') || text.includes('پلیٹلیٹس')) {
      return {
        rawText: `[THINKING_ANALYZING] Main aapki lab report ka DigiDoc Reference Ranges Database se mawazna kar raha hoon.
[SPEAKING_REASSURING] Normal Fasting Sugar 70-99 mg/dL hoti hai aur HbA1c 5.7% se kam hona chahiye. Serum Creatinine 0.6 se 1.2 mg/dL ke darmiyan gurdon ki sehat zahir karta hai.
Aapki report mein kitni reading aayi hai aur mareez ki umar kya hai?`,
        cleanSpeechText: `Main aapki lab report ka jaiza le raha hoon. Normal fasting sugar 70 se 99 hoti hai aur HbA1c 5.7 se kam hona chahiye. Aapki report mein kitni reading aayi hai?`,
        primaryTag: 'THINKING_ANALYZING',
        isUrgent: false
      };
    }

    // 3. Tier 1 Critical Emergencies & Red Flags (Immediate Life Threat)
    if (state.triageTier === 1) {
      let redFlagDetails = 'Yeh alamaat intehayi sangeen hain (Emergency Tier 1).';
      if (state.severityTrajectory === 'escalating') {
        redFlagDetails = 'Khabardaar! Alamaat mein shadeed izaafa aur bigaar dekha gaya hai (Emergency Deterioration Tier 1).';
      }

      return {
        rawText: `[ALERT_URGENT] ${redFlagDetails}
Agar seene mein shadeed dard, baen baazu (left arm) mein takleef, saans lene mein shadeed dushwari, ya behoshi ke asraat hain, toh barahe karam foran **Emergency Rescue 1122** par call karein ya **Quetta Civil Hospital / NICVD** ke Emergency Room tashreef le jayein. Kisi qisam ka intizar na karein!`,
        cleanSpeechText: `Khabardaar! Yeh alamaat intehayi sangeen hain. Agar seene mein shadeed dard ya saans lene mein dushwari hai, toh foran Emergency Rescue 1122 par call karein ya hospital ke Emergency Room jayein.`,
        primaryTag: 'ALERT_URGENT',
        isUrgent: true
      };
    }

    // 4. Clinical Deterioration Escalation (Tier 2 Urgent Escalation)
    if (state.severityTrajectory === 'escalating') {
      const topDifferentials = state.differentialConditions || [];
      const topCondition = topDifferentials[0]?.condition;
      const conditionName = topCondition
        ? (topCondition.name?.rur || topCondition.name?.en)
        : (state.chiefComplaint || 'takleef');
      const doctor = topCondition
        ? this.findQuettaDoctor(topCondition.specialty)
        : this.doctors[0];

      const followUp = this.formulateAdaptiveFollowUp(state);

      return {
        rawText: `[ALERT_URGENT] **Deterioration Detected:** Aapki alamaat pehle se barh rahi hain (Escalated to Tier 2 Urgent Care).
[SPEAKING_REASSURING] Takleef mein izaafay ke bais kisi qisam ki khud-tashkheesi (self-medication) se parhez karein. Alamaat ke mutabiq yeh mumkinah tor par **${conditionName}** ki taraf ishara karti hain.

- **Rehnumayi:** 24 ghantay ke andar mustanad doctor se muaina zaroori hai.
- **Mahir Doctor:** Aap Quetta mein **${doctor.name}** (${doctor.primarySpecialty} - ${doctor.hospitalOrClinic || 'Quetta Hospital'}) se rabta karein (Phone: ${doctor.publicPhone || '081-2829915'}).

${followUp.text}`,
        cleanSpeechText: `Aapki takleef pehle se barh rahi hai, is liye fori doctor se muaina zaroori hai. ${followUp.cleanSpeechText}`,
        primaryTag: 'ALERT_URGENT',
        isUrgent: true
      };
    }

    // 5. Differential Diagnosis & Multi-Turn Condition Matching
    if (state.differentialConditions && state.differentialConditions.length > 0) {
      const topCondition = state.differentialConditions[0].condition;
      const conditionName = topCondition.name?.rur || topCondition.name?.en;
      const doctor = this.findQuettaDoctor(topCondition.specialty);
      const primarySymName = state.chiefComplaint || 'takleef';

      const followUp = this.formulateAdaptiveFollowUp(state);

      const responseText = `[NOD_EMPATHETIC] Main aapki takleef (${primarySymName}) samajh sakta hoon.
[SPEAKING_REASSURING] Alamaat ke mutabiq yeh mumkinah tor par **${conditionName}** ki nishandahi ho sakti hai. 

- **Rehnumayi:** ${topCondition.advice || 'Aaram karein aur hydration ka khayal rakhein.'}
- **Mahir Doctor:** Aapko **${doctor.name}** (${doctor.primarySpecialty} - ${doctor.hospitalOrClinic || 'Quetta Hospital'}) se rabta karna chahiye. Phone: ${doctor.publicPhone || '081-2829915'}.

${followUp.text}`;

      const speechText = `Main aapki takleef samajh sakta hoon. Alamaat ke mutabiq yeh ${conditionName} ho sakti hai. ${followUp.cleanSpeechText}`;

      return {
        rawText: responseText,
        cleanSpeechText: speechText,
        primaryTag: 'SPEAKING_REASSURING',
        isUrgent: state.triageTier <= 2
      };
    }

    // 6. Follow-up Duration / Severity provided without named symptom
    if (text.includes('din') || text.includes('hafte') || text.includes('kal') ||
        text.includes('tez') || text.includes('halka') || text.includes('bohat') ||
        text.includes('shadeed') || text.includes('days') || text.includes('yesterday')) {
      const generalDoc = this.doctors.find(d => d.primarySpecialty?.toLowerCase().includes('general medicine')) || this.doctors[1];
      const followUp = this.formulateAdaptiveFollowUp(state);

      return {
        rawText: `[NOD_EMPATHETIC] Tafseel batane ka shukriya. Main samajh raha hoon.
[SPEAKING_REASSURING] Is doraniye aur takleef ke mutabiq kisi bhi qisam ki khud-tashkheesi se parhez karein aur mustanad doctor se muaina karwayein.
Aap Quetta mein **${generalDoc.name}** (${generalDoc.hospitalOrClinic || 'Quetta Hospital'}) se rabta kar saktay hain (Rabta: ${generalDoc.publicPhone || '081-2829915'}).

${followUp.text}`,
        cleanSpeechText: `Tafseel batane ka shukriya. ${followUp.cleanSpeechText}`,
        primaryTag: 'SPEAKING_REASSURING',
        isUrgent: false
      };
    }

    // 7. Initial Greeting ONLY if first turn
    if (this.conversationTurn === 1 && (text.includes('salam') || text.includes('hello') || text.includes('hi') || text.length < 5)) {
      return {
        rawText: `[WARM_SMILE] Assalam-o-Alaikum! Main DigiDoc hoon, aapka digital healthcare consultant. [LISTENING_ATTENTIVE] Main aapki sehat ke hawalay se sun raha hoon. Apni takleef, alamaat ya lab report aasaan alfaaz mein batayein.`,
        cleanSpeechText: `Assalam-o-Alaikum! Main DigiDoc hoon. Main aapki sehat ke hawalay se sun raha hoon. Apni takleef ya alamaat batayein.`,
        primaryTag: 'WARM_SMILE',
        isUrgent: false
      };
    }

    // 8. Natural non-repetitive clarification if not understood
    const followUp = this.formulateAdaptiveFollowUp(state);
    return {
      rawText: `[LISTENING_ATTENTIVE] Ji, main sun raha hoon. Baraye meharbani apni takleef ya alamaat (jaise bukhar, sar dard, pait ki kharabi, ya khansi) ke baray mein mazeed wazeh batayein taakay main sahi doctor aur ilaj ki taraf aapki rehnumayi kar sakun.\n\n${followUp.text}`,
      cleanSpeechText: `Ji, main sun raha hoon. Baraye meharbani apni alamaat jaise bukhar, sar dard, ya pait ki takleef wazeh batayein.`,
      primaryTag: 'LISTENING_ATTENTIVE',
      isUrgent: false
    };
  }
}

export const clinicalEngine = new ClinicalEngine();
export default clinicalEngine;
