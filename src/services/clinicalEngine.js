import diseasesData from '../data/diseases_conditions.json';
import quettaDoctors from '../data/quetta_doctors.json';
import labRangesData from '../data/lab_reference_ranges.json';

export class ClinicalEngine {
  constructor() {
    this.symptomsList = diseasesData.symptoms || [];
    this.conditionsList = diseasesData.conditions || [];
    this.specialtiesMap = diseasesData.specialties || {};
    this.doctors = quettaDoctors || [];
    this.tests = labRangesData.tests || [];
    this.conversationTurn = 0;
  }

  reset() {
    this.conversationTurn = 0;
  }

  // Multilingual Symptom Matcher across Urdu script, Roman Urdu, and English
  detectSymptoms(text) {
    const lower = text.toLowerCase();
    const matched = [];

    for (const sym of this.symptomsList) {
      const enKeywords = sym.keywords?.en || [];
      const urKeywords = sym.keywords?.ur || [];
      const rurKeywords = sym.keywords?.rur || [];

      const allKeywords = [...enKeywords, ...urKeywords, ...rurKeywords];
      for (const kw of allKeywords) {
        if (lower.includes(kw.toLowerCase()) || text.includes(kw)) {
          matched.push(sym);
          break;
        }
      }
    }

    return matched;
  }

  // Match condition from detected symptoms
  predictConditions(matchedSymptoms) {
    if (!matchedSymptoms || matchedSymptoms.length === 0) return [];

    const symptomIds = new Set(matchedSymptoms.map(s => s.id));
    const scored = [];

    for (const cond of this.conditionsList) {
      let score = 0;
      let matchedCount = 0;

      for (const s of cond.symptoms || []) {
        if (symptomIds.has(s.id)) {
          score += s.weight;
          matchedCount++;
        }
      }

      if (matchedCount > 0) {
        scored.push({
          condition: cond,
          score,
          matchedCount
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  // Find Quetta Doctor by specialty
  findQuettaDoctor(specialtyKey) {
    const specInfo = this.specialtiesMap[specialtyKey];
    const specEn = specInfo?.en?.toLowerCase() || '';

    // Search doctors matching specialty
    const matched = this.doctors.find(d => {
      const primary = d.primarySpecialty?.toLowerCase() || '';
      return primary.includes(specEn) || (specEn && primary.includes(specEn.split(' ')[0]));
    });

    return matched || this.doctors[0];
  }

  // Generate intelligent Pakistani Clinical Response
  generateResponse(userMessage) {
    this.conversationTurn++;
    const text = userMessage.toLowerCase().trim();

    // 1. Detect Red Flags & Critical Emergencies (Tier 1)
    const detectedSymptoms = this.detectSymptoms(userMessage);
    const hasRedFlag = detectedSymptoms.some(s => s.red_flag) || 
      text.includes('chest pain') || text.includes('seene me dard') || text.includes('seene mein dard') ||
      text.includes('سینے میں درد') || text.includes('heart attack') || text.includes('saans ruk') ||
      text.includes('stroke') || text.includes('khoon ki ulti') || text.includes('خون کی الٹی');

    if (hasRedFlag) {
      return {
        rawText: `[ALERT_URGENT] Khabardaar! Yeh alamaat intehayi sangeen hain (Emergency Tier 1). 
Agar seene mein shadeed dard, baen baazu (left arm) mein takleef, ya saans lene mein shadeed dushwari hai, toh barahe karam foran Emergency Rescue 1122 par call karein ya Quetta Civil Hospital / NICVD ke Emergency Room tashreef le jayein. Kisi qisam ka intizar na karein!`,
        cleanSpeechText: `Khabardaar! Yeh alamaat intehayi sangeen hain. Agar seene mein shadeed dard ya saans lene mein dushwari hai, toh foran Emergency Rescue 1122 par call karein ya hospital ke Emergency Room jayein.`,
        primaryTag: 'ALERT_URGENT',
        isUrgent: true
      };
    }

    // 2. Lab Biomarker & Report Queries
    if (text.includes('sugar') || text.includes('شوگر') || text.includes('fbs') || text.includes('hba1c') || text.includes('creatinine') || text.includes('cbc') || text.includes('platelets') || text.includes('پلیٹلیٹس')) {
      return {
        rawText: `[THINKING_ANALYZING] Main aapki lab report ka DigiDoc Reference Ranges Database se mawazna kar raha hoon.
[SPEAKING_REASSURING] Normal Fasting Sugar 70-99 mg/dL hoti hai aur HbA1c 5.7% se kam hona chahiye. Serum Creatinine 0.6 se 1.2 mg/dL ke darmiyan gurdon ki sehat zahir karta hai.
Aapki report mein kitni reading aayi hai aur mareez ki umar kya hai?`,
        cleanSpeechText: `Main aapki lab report ka jaiza le raha hoon. Normal fasting sugar 70 se 99 hoti hai aur HbA1c 5.7 se kam hona chahiye. Aapki report mein kitni reading aayi hai?`,
        primaryTag: 'THINKING_ANALYZING',
        isUrgent: false
      };
    }

    // 3. Condition / Symptom Match
    if (detectedSymptoms.length > 0) {
      const topConditions = this.predictConditions(detectedSymptoms);
      const primarySym = detectedSymptoms[0];
      const symName = primarySym.name.ur || primarySym.name.rur || primarySym.name.en;

      if (topConditions.length > 0) {
        const top = topConditions[0].condition;
        const conditionName = top.name.ur || top.name.rur || top.name.en;
        const doctor = this.findQuettaDoctor(top.specialty);

        let responseText = `[NOD_EMPATHETIC] Main aapki takleef (${symName}) samajh sakta hoon.
[SPEAKING_REASSURING] Alamaat ke mutabiq yeh mumkinah tor par **${conditionName}** ki nishandahi ho sakti hai. 

- **Rehnumayi:** ${top.advice || 'Aaram karein aur hydration ka khayal rakhein.'}
- **Mahir Doctor:** Aapko **${doctor.name}** (${doctor.primarySpecialty} - ${doctor.hospitalOrClinic || 'Quetta Hospital'}) se rabta karna chahiye. Phone: ${doctor.publicPhone || '081-2829915'}.

Yeh takleef aapko kitne din se hai aur kya is ke sath bukhar ya koi aur alamat bhi hai?`;

        let speechText = `Main aapki takleef samajh sakta hoon. Alamaat ke mutabiq yeh ${top.name.rur || conditionName} ho sakti hai. Yeh takleef aapko kitne din se hai aur kya is ke sath bukhar bhi hai?`;

        return {
          rawText: responseText,
          cleanSpeechText: speechText,
          primaryTag: 'SPEAKING_REASSURING',
          isUrgent: top.default_tier === 1
        };
      }
    }

    // 4. Follow-up Duration / Severity answers (e.g. "2 din se hai", "tez dard hai", "kal se")
    if (text.includes('din') || text.includes('hafte') || text.includes('kal') || text.includes('tez') || text.includes('halka') || text.includes('bohat') || text.includes('shadeed') || text.includes('days') || text.includes('yesterday')) {
      const generalDoc = this.doctors.find(d => d.primarySpecialty?.toLowerCase().includes('general medicine')) || this.doctors[1];
      return {
        rawText: `[NOD_EMPATHETIC] Tafseel batane ka shukriya. Main samajh raha hoon.
[SPEAKING_REASSURING] Is doraniye aur takleef ke mutabiq, kisi bhi qisam ki khud-tashkheesi (self-medication) se parhez karein aur mustanad doctor se muaina karwayein.
Aap Quetta mein **${generalDoc.name}** (${generalDoc.hospitalOrClinic || 'Quetta Hospital'}) se rabta kar saktay hain (Rabta: ${generalDoc.publicPhone || '081-2829915'}).
Kya aapko koi purani bimari (jaise Sugar ya Blood Pressure) hai?`,
        cleanSpeechText: `Tafseel batane ka shukriya. Is takleef ke liye doctor se muaina zaroori hai. Kya aapko pehle se sugar ya blood pressure ki bimari hai?`,
        primaryTag: 'SPEAKING_REASSURING',
        isUrgent: false
      };
    }

    // 5. Initial Greeting ONLY if first turn
    if (this.conversationTurn === 1 && (text.includes('salam') || text.includes('hello') || text.includes('hi') || text.length < 5)) {
      return {
        rawText: `[WARM_SMILE] Assalam-o-Alaikum! Main DigiDoc hoon, aapka digital healthcare consultant. [LISTENING_ATTENTIVE] Main aapki sehat ke hawalay se sun raha hoon. Apni takleef, alamaat ya lab report aasaan alfaaz mein batayein.`,
        cleanSpeechText: `Assalam-o-Alaikum! Main DigiDoc hoon. Main aapki sehat ke hawalay se sun raha hoon. Apni takleef ya alamaat batayein.`,
        primaryTag: 'WARM_SMILE',
        isUrgent: false
      };
    }

    // 6. Natural clarification if not understood (NEVER repeat Assalam-o-Alaikum!)
    return {
      rawText: `[LISTENING_ATTENTIVE] Ji, main sun raha hoon. Baraye meharbani apni takleef ya alamaat (jaise bukhar, sar dard, pait ki kharabi, ya khansi) ke baray mein mazeed wazeh batayein taakay main sahi doctor aur ilaj ki taraf aapki rehnumayi kar sakun.`,
      cleanSpeechText: `Ji, main sun raha hoon. Baraye meharbani apni alamaat jaise bukhar, sar dard, ya pait ki takleef wazeh batayein.`,
      primaryTag: 'LISTENING_ATTENTIVE',
      isUrgent: false
    };
  }
}

export const clinicalEngine = new ClinicalEngine();
