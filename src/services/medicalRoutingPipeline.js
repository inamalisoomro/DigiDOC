// Medical Reasoning, Triage & Specialist Routing Pipeline for DigiDoc

import diseasesData from '../data/diseases_conditions.json' with { type: 'json' };
import quettaDoctors from '../data/quetta_doctors.json' with { type: 'json' };

export class MedicalRoutingPipeline {
  constructor() {
    this.symptomsList = diseasesData.symptoms || [];
    this.conditionsList = diseasesData.conditions || [];
    this.specialtiesMap = diseasesData.specialties || {};
    this.doctors = quettaDoctors || [];
    this.scoringRules = diseasesData.meta?.scoring || {};
    this.vulnerableGroups = diseasesData.meta?.vulnerable_groups || {};

    // Standard clinical routing registry
    this.specialtyRegistry = {
      gp: { en: 'General Physician / Primary Care', ur: 'جنرل فزیشن', rur: 'General Physician', defaultTier: 3 },
      cardiologist: { en: 'Cardiologist', ur: 'ماہرِ امراضِ قلب', rur: 'Cardiologist', defaultTier: 2 },
      neurologist: { en: 'Neurologist', ur: 'ماہرِ اعصاب', rur: 'Neurologist', defaultTier: 2 },
      gastroenterologist: { en: 'Gastroenterologist', ur: 'ماہرِ معدہ و جگر', rur: 'Gastroenterologist', defaultTier: 2 },
      pulmonologist: { en: 'Pulmonologist / Chest Specialist', ur: 'ماہرِ امراضِ سینہ', rur: 'Pulmonologist', defaultTier: 2 },
      dermatologist: { en: 'Dermatologist / Skin Specialist', ur: 'ماہرِ امراضِ جلد', rur: 'Dermatologist', defaultTier: 3 },
      orthopedic: { en: 'Orthopedic Specialist', ur: 'ماہرِ ہڈی و جوڑ', rur: 'Orthopedic Specialist', defaultTier: 3 },
      endocrinologist: { en: 'Endocrinologist / Diabetologist', ur: 'ماہرِ شوگر و غدد', rur: 'Diabetologist', defaultTier: 3 },
      gynecologist: { en: 'Gynecologist & Obstetrician', ur: 'ماہرِ امراضِ نسواں', rur: 'Gynecologist', defaultTier: 2 },
      pediatrician: { en: 'Pediatrician / Child Specialist', ur: 'ماہرِ اطفال', rur: 'Child Specialist', defaultTier: 2 },
      psychiatrist: { en: 'Psychiatrist / Mental Health Specialist', ur: 'ماہرِ نفسیات', rur: 'Psychiatrist', defaultTier: 3 },
      urologist: { en: 'Urologist / Kidney Specialist', ur: 'ماہرِ گردہ و مثانہ', rur: 'Urologist', defaultTier: 2 },
      ent: { en: 'ENT Specialist', ur: 'ماہرِ ناک کان گلا', rur: 'ENT Specialist', defaultTier: 3 },
      ophthalmologist: { en: 'Ophthalmologist / Eye Specialist', ur: 'ماہرِ امراضِ چشم', rur: 'Eye Specialist', defaultTier: 3 },
      emergency: { en: 'Emergency Medicine / Trauma ER', ur: 'ایمرجنسی میڈیسن', rur: 'Emergency Medicine ER', defaultTier: 1 }
    };
  }

  // Detect symptoms present in user utterance while respecting negations
  extractSymptomsWithNegation(text) {
    if (!text || typeof text !== 'string') return { detected: [], denied: [] };

    const lower = text.toLowerCase();
    const detected = [];
    const denied = [];

    // Negation phrases across English, Urdu, and Roman Urdu
    const negationRegex = /(no\s+|not\s+|never\s+|denies\s+|without\s+|nahi\s+|nahin\s+|na\s+|baghair\s+|نہیں\s+|نہ\s+)([a-zA-Z\u0600-\u06FF\s]+)/gi;

    for (const sym of this.symptomsList) {
      const enKeywords = sym.keywords?.en || [];
      const urKeywords = sym.keywords?.ur || [];
      const rurKeywords = sym.keywords?.rur || [];
      const allKeywords = [...enKeywords, ...urKeywords, ...rurKeywords];

      let matchFound = false;
      let isNegated = false;

      for (const kw of allKeywords) {
        const kwLower = kw.toLowerCase();
        const index = lower.indexOf(kwLower);

        if (index !== -1 || text.includes(kw)) {
          matchFound = true;

          // Check if preceded by a negation marker within 25 characters
          const prefix = lower.substring(Math.max(0, index - 25), index);
          if (/(no|not|without|never|denies|nahi|nahin|na\b|baghair|نہیں|نہ)/i.test(prefix)) {
            isNegated = true;
          }
          // Check if followed by negation marker within 15 characters (e.g. "bukhar nahi hai")
          const suffix = lower.substring(index, Math.min(lower.length, index + kwLower.length + 20));
          if (/(nahi|nahin|na\b|نہیں)/i.test(suffix)) {
            isNegated = true;
          }
          break;
        }
      }

      if (matchFound) {
        if (isNegated) {
          denied.push(sym);
        } else {
          detected.push(sym);
        }
      }
    }

    // Additional clinical phrase synonyms
    if (lower.includes('stomach hurts') || lower.includes('stomach is hurting') || lower.includes('pain in stomach')) {
      const abdSym = this.symptomsList.find(s => s.id === 'abdominal_pain');
      if (abdSym && !detected.some(s => s.id === 'abdominal_pain')) detected.push(abdSym);
    }
    if (lower.includes('back pain') || lower.includes('lower back') || lower.includes('kamar dard') || lower.includes('back ache')) {
      const flankSym = this.symptomsList.find(s => s.id === 'flank_pain');
      if (flankSym && !detected.some(s => s.id === 'flank_pain')) detected.push(flankSym);
    }
    if ((lower.includes('pain on my left side') || lower.includes('pain on my right side') || lower.includes('side pain')) && detected.length === 0) {
      const bodySym = this.symptomsList.find(s => s.id === 'body_ache');
      if (bodySym && !detected.some(s => s.id === 'body_ache')) detected.push(bodySym);
    }

    // Deduplicate implied parent symptoms (e.g. if severe_headache is detected, drop redundant generic headache)
    const impliesSet = new Set();
    for (const sym of detected) {
      if (sym.implies && Array.isArray(sym.implies)) {
        for (const p of sym.implies) {
          impliesSet.add(p);
        }
      }
    }
    const finalDetected = detected.filter(s => !impliesSet.has(s.id));

    return { detected: finalDetected, denied };
  }

  // Calculate condition differentials using noisy-OR probability aggregation
  evaluateDifferentials(symptomsMap, patientProfile = {}) {
    const symptomIds = new Set();
    for (const [id, sym] of symptomsMap.entries()) {
      symptomIds.add(id);
      // Expand implied parent symptoms (e.g. severe_headache implies headache)
      const def = this.symptomsList.find(s => s.id === id);
      if (def?.implies) {
        for (const parentId of def.implies) {
          symptomIds.add(parentId);
        }
      }
    }

    const scored = [];

    for (const cond of this.conditionsList) {
      // Check required_any rule if present
      if (cond.required_any && cond.required_any.length > 0) {
        const hasRequired = cond.required_any.some(reqId => symptomIds.has(reqId));
        if (!hasRequired) continue;
      }

      let notPProduct = 1.0;
      let matchedCount = 0;
      const matchedSymptoms = [];

      for (const sym of cond.symptoms || []) {
        if (symptomIds.has(sym.id)) {
          const w = Math.min(0.95, Math.max(0.05, sym.weight || 0.5));
          notPProduct *= (1.0 - w);
          matchedCount++;
          matchedSymptoms.push(sym.id);
        }
      }

      if (matchedCount > 0) {
        // Noisy-OR formula: 1 - Product(1 - w)
        const score = Math.min(0.85, 1.0 - notPProduct);
        scored.push({
          condition: cond,
          score,
          matchedCount,
          matchedSymptoms
        });
      }
    }

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score);
  }

  // Determine specialty and care level
  routePatient(clinicalState) {
    const symptomsMap = clinicalState.symptoms;
    const patientProfile = clinicalState.patientProfile;

    // 1. Emergency Department Override if Tier 1
    if (clinicalState.safetyStatus.tier === 1) {
      const bestDoc = this.findQuettaDoctor('gp') || this.doctors[0];
      return {
        specialtyId: 'emergency',
        specialtyEn: 'Emergency Department / Rescue 1122',
        specialtyUr: 'ایمرجنسی وارڈ / ریسکیو 1122',
        specialtyRur: 'Emergency Department / Rescue 1122',
        careLevel: 'Immediate Emergency Medical Care (Tier 1)',
        tier: 1,
        recommendedDoctor: bestDoc,
        rationale: 'Reported symptoms indicate a medical red flag requiring emergency room evaluation without delay.'
      };
    }

    // 2. Pediatrician if child < 14 years
    if (patientProfile.age !== null && patientProfile.age < 14) {
      const pedDoc = this.findQuettaDoctor('pediatrician');
      return {
        specialtyId: 'pediatrician',
        specialtyEn: 'Pediatrician / Child Specialist',
        specialtyUr: 'ماہرِ اطفال',
        specialtyRur: 'Child Specialist',
        careLevel: 'Pediatric Clinic Consultation (Tier 2-3)',
        tier: 2,
        recommendedDoctor: pedDoc,
        rationale: 'Patient is a child requiring pediatric assessment.'
      };
    }

    // 3. Gynecologist if pregnancy-related or female reproductive symptoms
    if (patientProfile.isPregnant) {
      const gynDoc = this.findQuettaDoctor('gynecologist');
      return {
        specialtyId: 'gynecologist',
        specialtyEn: 'Gynecologist & Obstetrician',
        specialtyUr: 'ماہرِ امراضِ نسواں',
        specialtyRur: 'Gynecologist',
        careLevel: 'Obstetric Consultation',
        tier: 2,
        recommendedDoctor: gynDoc,
        rationale: 'Patient is pregnant; medical symptoms require careful obstetric monitoring.'
      };
    }

    // 4. Differentials-based routing
    const differentials = this.evaluateDifferentials(symptomsMap, patientProfile);

    if (differentials.length > 0) {
      const top = differentials[0];
      const cond = top.condition;
      const specKey = cond.specialty || 'gp';
      const specDef = this.specialtyRegistry[specKey] || this.specialtyRegistry.gp;
      const matchedDoctor = this.findQuettaDoctor(specKey);

      let urgencyTier = cond.default_tier || 3;

      // Check vulnerable group escalation
      if ((patientProfile.age && (patientProfile.age < 5 || patientProfile.age >= 65)) || patientProfile.chronicConditions.length > 0) {
        if (urgencyTier > 2) urgencyTier = 2;
      }

      return {
        specialtyId: specKey,
        specialtyEn: specDef.en,
        specialtyUr: specDef.ur,
        specialtyRur: specDef.rur,
        careLevel: urgencyTier === 2 ? 'Urgent Clinic Consultation (within 24 hours)' : 'Routine Outpatient Consultation',
        tier: urgencyTier,
        topCondition: cond,
        differentials: differentials.slice(0, 3),
        recommendedDoctor: matchedDoctor,
        rationale: `Reported symptoms (${top.matchedSymptoms.join(', ')}) suggest possible ${cond.name.en}. Evaluation by ${specDef.en} is recommended.`
      };
    }

    // 5. Default General Physician
    const gpDoc = this.findQuettaDoctor('gp');
    return {
      specialtyId: 'gp',
      specialtyEn: 'General Physician / Primary Care',
      specialtyUr: 'جنرل فزیشن',
      specialtyRur: 'General Physician',
      careLevel: 'Routine Primary Care Consultation',
      tier: 3,
      recommendedDoctor: gpDoc,
      rationale: 'Symptoms are non-specific and are best initially evaluated by a General Physician for thorough physical examination and baseline labs.'
    };
  }

  // Find Quetta Doctor from local registry matching specialty
  findQuettaDoctor(specialtyKey) {
    const specKeywords = {
      gp: ['general physician', 'general medicine', 'internal medicine', 'family medicine'],
      cardiologist: ['cardiologist', 'cardiology', 'heart'],
      neurologist: ['neurologist', 'neurology', 'neuro'],
      gastroenterologist: ['gastroenterologist', 'gastroenterology', 'hepatologist', 'liver'],
      pulmonologist: ['pulmonologist', 'chest', 'respiratory'],
      dermatologist: ['dermatologist', 'skin'],
      orthopedic: ['orthopedic', 'ortho', 'bone'],
      endocrinologist: ['diabetologist', 'endocrinologist', 'sugar'],
      gynecologist: ['gynecologist', 'gynecology', 'obstetrician', 'gynae'],
      pediatrician: ['pediatrician', 'child', 'pediatrics'],
      psychiatrist: ['psychiatrist', 'psychiatry', 'mental'],
      urologist: ['urologist', 'urology', 'kidney'],
      ent: ['ent', 'ear', 'nose', 'throat'],
      ophthalmologist: ['eye', 'ophthalmologist', 'retina']
    };

    const targetKws = specKeywords[specialtyKey] || ['general'];

    for (const doc of this.doctors) {
      const docSpec = (doc.primarySpecialty || '').toLowerCase();
      for (const kw of targetKws) {
        if (docSpec.includes(kw)) {
          return doc;
        }
      }
    }

    return this.doctors[0] || null;
  }
}

export const medicalRoutingPipeline = new MedicalRoutingPipeline();
