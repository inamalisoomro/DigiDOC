// Clinical Session State & Multi-turn Memory Engine for DigiDoc
// Fully unified with ClinicalStateManager API for complete teammate and multi-branch compatibility

import diseasesData from '../data/diseases_conditions.json' with { type: 'json' };

/**
 * Deterioration keywords across English, Roman Urdu, and Urdu script.
 */
export const WORSENING_KEYWORDS = {
  en: [
    'ailing more', 'getting worse', 'worse', 'worsening', 'deteriorating',
    'deteriorated', 'severe now', 'more severe', 'increased pain', 'pain increased',
    'more painful', 'pain is increasing', 'pain getting worse', 'fever increased',
    'becoming unbearable', 'cannot bear', 'unbearable', 'feeling much worse',
    'declining', 'aggravated', 'intensified', 'chills', 'high fever'
  ],
  rur: [
    'ailing more', 'getting worse', 'dard barh gaya', 'dard barh raha hai',
    'dard barh rahi hai', 'takleef barh gayi', 'takleef barh rahi hai',
    'takleef barh rahi', 'ziyada shadeed', 'zyada shadeed', 'shadeed ho gaya',
    'shadeed ho rahi hai', 'bohat shadeed', 'tez bukhar', 'chills',
    'kamzori barh rahi hai', 'kamzori barh rahi', 'kamzori barh gayi',
    'tabiyat kharab ho rahi hai', 'tabiyat mazeed kharab', 'halat kharab ho rahi hai',
    'halat bigar rahi hai', 'halat kharab', 'dard ziada', 'dard zyada',
    'dard bohat barh gaya', 'bardasht se bahar', 'barhta ja raha hai',
    'barhta ja raha', 'barhti ja rahi hai', 'barhti ja rahi', 'mazeed takleef',
    'pehle se zyada', 'pehle se ziada', 'bukhar tez ho gaya',
    'saans lene mein mazeed dushwari', 'dard shadeed ho gaya'
  ],
  ur: [
    'بڑھ گیا', 'بڑھ رہا ہے', 'بڑھ رہی ہے', 'درد بڑھ گیا', 'درد بڑھ رہا ہے',
    'تکلیف بڑھ گئی', 'زیادہ شدید', 'شدید ہو گیا', 'تیز بخار', 'کمزوری بڑھ رہی ہے',
    'طبیعت زیادہ خراب', 'طبیعت بگڑ گئی', 'حالت خراب', 'حالت بگڑ گئی',
    'برداشت سے باہر', 'پہلے سے زیادہ خراب', 'پہلے سے زیادہ', 'مزید خراب'
  ]
};

export const IMPROVING_KEYWORDS = {
  en: [
    'improving', 'better', 'feeling better', 'getting better', 'recovering',
    'less pain', 'pain reduced', 'fever subsiding', 'fever went down', 'relief'
  ],
  rur: [
    'behtar ho raha', 'behtar feel ho raha', 'tabiyat theek ho rahi',
    'dard kam ho gaya', 'kam ho raha', 'afaaqa hai', 'afaaqa', 'sukoon mila',
    'theek ho raha hai', 'behtar hai', 'kam hogaya'
  ],
  ur: [
    'بہتر ہو رہا ہے', 'بہتر ہے', 'طبیعت بہتر', 'درد کم ہو گیا', 'افاقہ ہے', 'ٹھیک ہو رہا ہے'
  ]
};

export const NEGATION_PATTERNS = [
  // English
  /\b(?:no|not|without|never|denies|haven't|dont have|don't have|did not|didn't)\s+([a-z\s]{2,25})\b/gi,
  // Roman Urdu (e.g. bukhar nahi hai, dard nahi, vomiting nahi hui)
  /([a-z\s]{2,25})\s+\b(?:nahi|nahin|na|baghair|nahi hai|nahin hai|nahi hui|nahin hui)\b/gi,
  // Urdu script
  /([^\s]{2,25})\s*(?:نہیں|نہ|بغیر|نہیں ہے)/g
];

/**
 * Teammate's ClinicalStateManager API interface.
 */
export class ClinicalStateManager {
  constructor() {
    this.symptomsList = (diseasesData.symptoms || []).map(sym => {
      if (sym.id === 'runny_nose') {
        const rur = sym.keywords?.rur || [];
        const ur = sym.keywords?.ur || [];
        return {
          ...sym,
          keywords: {
            ...sym.keywords,
            rur: [...rur, 'nazla', 'nazlah'],
            ur: [...ur, 'نزلہ']
          }
        };
      }
      return sym;
    });
    this.conditionsList = diseasesData.conditions || [];
    this.redFlagRules = diseasesData.red_flag_rules || [];
    this.reset();
  }

  /**
   * Reset state to pristine clinical baseline.
   */
  reset() {
    this.state = {
      chiefComplaint: null,
      accumulatedSymptoms: [],
      deniedSymptoms: [],
      timeline: { duration: '', onset: '' },
      severityTrajectory: 'stable', // 'improving' | 'stable' | 'escalating'
      severityScore: 3, // 1 to 10
      triageTier: 4, // 1: Emergency, 2: Urgent, 3: Routine, 4: Self-care
      differentialConditions: [],
      askedQuestionIds: [],
      turnCount: 0
    };
    return this.getState();
  }

  /**
   * Return deep clone of state to avoid external mutations.
   */
  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  /**
   * Check if a specific question has already been asked.
   */
  hasQuestionBeenAsked(questionId) {
    if (!questionId) return false;
    return this.state.askedQuestionIds.includes(questionId);
  }

  /**
   * Mark a question ID as asked so it will never repeat.
   */
  markQuestionAsked(questionId) {
    if (questionId && !this.state.askedQuestionIds.includes(questionId)) {
      this.state.askedQuestionIds.push(questionId);
    }
  }

  /**
   * Detect worsening trajectory in user message.
   */
  detectTrajectory(text) {
    if (!text || typeof text !== 'string') return 'stable';
    const lower = text.toLowerCase();

    // Check worsening keywords
    for (const kw of WORSENING_KEYWORDS.en) {
      if (lower.includes(kw.toLowerCase())) return 'escalating';
    }
    for (const kw of WORSENING_KEYWORDS.rur) {
      if (lower.includes(kw.toLowerCase())) return 'escalating';
    }
    for (const kw of WORSENING_KEYWORDS.ur) {
      if (text.includes(kw)) return 'escalating';
    }

    // Check improving keywords
    for (const kw of IMPROVING_KEYWORDS.en) {
      if (lower.includes(kw.toLowerCase())) return 'improving';
    }
    for (const kw of IMPROVING_KEYWORDS.rur) {
      if (lower.includes(kw.toLowerCase())) return 'improving';
    }
    for (const kw of IMPROVING_KEYWORDS.ur) {
      if (text.includes(kw)) return 'improving';
    }

    return 'stable';
  }

  /**
   * Check if a symptom match in text is negated (e.g. "no fever", "bukhar nahi hai").
   */
  isSymptomNegated(text, symptom) {
    if (!text || !symptom) return false;
    const lower = text.toLowerCase();
    const allKeywords = [
      ...(symptom.keywords?.en || []),
      ...(symptom.keywords?.ur || []),
      ...(symptom.keywords?.rur || [])
    ];

    for (const kw of allKeywords) {
      const kwLower = kw.toLowerCase();
      const idx = lower.indexOf(kwLower);
      if (idx === -1 && !text.includes(kw)) continue;

      // Check text surrounding the keyword (within 35 characters)
      const start = Math.max(0, idx - 30);
      const end = Math.min(lower.length, idx + kwLower.length + 30);
      const windowText = lower.substring(start, end);

      const negationMarkers = [
        'no', 'not', 'without', 'never', 'denies', "don't", 'dont', "didn't",
        'nahi', 'nahin', 'nahi hai', 'nahin hai', 'na hai', 'nahi hui', 'nahin hui',
        'نہیں', 'نہ', 'بغیر'
      ];

      for (const neg of negationMarkers) {
        if (windowText.includes(neg)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Multilingual symptom extractor handling negations.
   */
  extractSymptomsWithNegation(text) {
    if (!text || typeof text !== 'string') return { confirmed: [], denied: [] };
    const lower = text.toLowerCase();
    const confirmed = [];
    const denied = [];

    for (const sym of this.symptomsList) {
      const allKeywords = [
        ...(sym.keywords?.en || []),
        ...(sym.keywords?.ur || []),
        ...(sym.keywords?.rur || [])
      ];

      let matched = false;
      for (const kw of allKeywords) {
        if (lower.includes(kw.toLowerCase()) || text.includes(kw)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        if (this.isSymptomNegated(text, sym)) {
          denied.push(sym);
        } else {
          confirmed.push(sym);
        }
      }
    }

    return { confirmed, denied };
  }

  /**
   * Extract timeline information (duration & onset) from user message.
   */
  detectTimeline(text) {
    if (!text || typeof text !== 'string') return { duration: '', onset: '' };
    const lower = text.toLowerCase();
    let duration = '';
    let onset = '';

    // Numeric + unit patterns: e.g. "2 din", "3 days", "1 hafta", "2 hours"
    const durationRegex = /(\d+|ek|aik|do|teen|char|paanch)\s*(din|days?|hafte|haftay|weeks?|ghante|hours?|mahine|months?)/i;
    const match = lower.match(durationRegex);
    if (match) {
      duration = match[0].trim();
      onset = `${duration} ago / pehle`;
    }

    // Relative day phrases
    if (lower.includes('kal se') || lower.includes('since yesterday') || lower.includes('yesterday')) {
      duration = '1 day (kal se)';
      onset = 'yesterday / kal';
    } else if (lower.includes('aaj se') || lower.includes('today') || lower.includes('subah se') || lower.includes('chand ghante')) {
      duration = 'few hours / today';
      onset = 'today / aaj';
    } else if (lower.includes('hafta') || lower.includes('week') || lower.includes('hafte se')) {
      if (!duration) duration = '1 week';
      if (!onset) onset = 'past week';
    }

    return { duration, onset };
  }

  /**
   * Expand implied symptoms (e.g. high_fever implies fever).
   */
  expandImpliedSymptoms(symptomIds) {
    const expanded = new Set(symptomIds);
    for (const id of symptomIds) {
      const sym = this.symptomsList.find(s => s.id === id);
      if (sym && sym.implies && Array.isArray(sym.implies)) {
        for (const impliedId of sym.implies) {
          expanded.add(impliedId);
        }
      }
    }
    return expanded;
  }

  /**
   * Predict conditions based on accumulated symptoms using noisy-OR scoring.
   */
  calculateDifferentialConditions(accumulatedSymptoms, deniedSymptoms = []) {
    if (!accumulatedSymptoms || accumulatedSymptoms.length === 0) return [];

    const deniedSet = new Set(deniedSymptoms);
    const activeIds = accumulatedSymptoms.map(s => s.id).filter(id => !deniedSet.has(id));
    const allSymptomIds = this.expandImpliedSymptoms(activeIds);

    const scored = [];

    for (const cond of this.conditionsList) {
      // Check required_any rule
      if (cond.required_any && cond.required_any.length > 0) {
        const satisfiesRequired = cond.required_any.some(reqId => allSymptomIds.has(reqId));
        if (!satisfiesRequired) continue;
      }

      let productNonOccurrence = 1;
      let matchedCount = 0;

      for (const s of cond.symptoms || []) {
        if (allSymptomIds.has(s.id)) {
          productNonOccurrence *= (1 - (s.weight || 0.5));
          matchedCount++;
        }
      }

      if (matchedCount > 0) {
        // Noisy-OR calculation capped at 0.85 per knowledge base specification
        const rawScore = 1 - productNonOccurrence;
        const score = Math.min(0.85, Math.round(rawScore * 100) / 100);

        scored.push({
          condition: cond,
          score,
          matchedCount
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score || b.matchedCount - a.matchedCount);
  }

  /**
   * Evaluate red flags and clinical rules to establish triage tier (1-4).
   */
  evaluateTriageTier(accumulatedSymptoms, trajectory, differentials, userText = '') {
    const lower = userText.toLowerCase();
    const symptomIds = new Set(accumulatedSymptoms.map(s => s.id));
    const allSymptomIds = this.expandImpliedSymptoms(Array.from(symptomIds));

    // 1. Direct Red Flags in symptoms
    const hasRedFlagSymptom = accumulatedSymptoms.some(s => s.red_flag);

    // 2. Direct Emergency Keywords
    const hasEmergencyKeywords =
      lower.includes('chest pain') || lower.includes('seene me dard') ||
      lower.includes('seene mein dard') || lower.includes('سینے میں درد') ||
      lower.includes('heart attack') || lower.includes('saans ruk') ||
      lower.includes('stroke') || lower.includes('khoon ki ulti') ||
      lower.includes('خون کی الٹی') || lower.includes('unconscious') ||
      lower.includes('behoshi') || lower.includes('dora') || lower.includes('seizure');

    // 3. Clinical Red Flag Rules Evaluation
    let redFlagRuleTriggered = false;
    for (const rule of this.redFlagRules) {
      if (rule.tier === 1) {
        let allMatched = true;
        if (rule.all && rule.all.length > 0) {
          allMatched = rule.all.every(id => allSymptomIds.has(id));
        }

        let anyMatched = false;
        if (rule.any && rule.any.length > 0) {
          anyMatched = rule.any.some(id => allSymptomIds.has(id));
        } else {
          anyMatched = true;
        }

        if (allMatched && anyMatched) {
          redFlagRuleTriggered = true;
          break;
        }
      }
    }

    // Tier 1: Emergency condition
    if (hasRedFlagSymptom || hasEmergencyKeywords || redFlagRuleTriggered) {
      return 1;
    }

    // Base Tier from top differential conditions
    let baseTier = 4;
    if (differentials && differentials.length > 0) {
      const topTiers = differentials.slice(0, 3).map(d => d.condition.default_tier || 3);
      baseTier = Math.min(...topTiers);
    } else if (accumulatedSymptoms.length > 0) {
      baseTier = 3;
    }

    // Deterioration Escalation (Lower tier number = higher urgency)
    if (trajectory === 'escalating') {
      if (baseTier === 4) {
        baseTier = 3;
      } else if (baseTier === 3) {
        baseTier = 2; // Escalate Routine -> Urgent
      } else if (baseTier === 2) {
        // Severe worsening in an urgent condition escalates towards Tier 1
        const hasSevereSigns = lower.includes('shadeed') || lower.includes('unbearable') ||
          lower.includes('chills') || lower.includes('tez bukhar') || lower.includes('severe');
        if (hasSevereSigns) {
          baseTier = 1;
        }
      }
    }

    return baseTier;
  }

  /**
   * Calculate severity score (1-10) based on tier, trajectory, and symptom burden.
   */
  calculateSeverityScore(triageTier, trajectory, accumulatedSymptoms) {
    let score = 3;

    switch (triageTier) {
      case 1:
        score = 9;
        break;
      case 2:
        score = 7;
        break;
      case 3:
        score = 5;
        break;
      case 4:
      default:
        score = 3;
        break;
    }

    // Weight by number of accumulated symptoms
    if (accumulatedSymptoms.length >= 4) {
      score += 1;
    }

    // Trajectory adjustments
    if (trajectory === 'escalating') {
      score += 2;
    } else if (trajectory === 'improving') {
      score -= 2;
    }

    return Math.max(1, Math.min(10, score));
  }

  /**
   * Main multi-turn state update method.
   * Ingests userText, accumulates memory, evaluates trajectory, updates differentials & tier.
   */
  update(userText) {
    if (!userText || typeof userText !== 'string') {
      return this.getState();
    }

    this.state.turnCount++;

    // 1. Extract symptoms & negations
    const { confirmed, denied } = this.extractSymptomsWithNegation(userText);

    // Update denied symptoms
    for (const d of denied) {
      if (!this.state.deniedSymptoms.includes(d.id)) {
        this.state.deniedSymptoms.push(d.id);
      }
      this.state.accumulatedSymptoms = this.state.accumulatedSymptoms.filter(s => s.id !== d.id);
    }

    // Accumulate confirmed symptoms
    for (const c of confirmed) {
      this.state.deniedSymptoms = this.state.deniedSymptoms.filter(id => id !== c.id);

      const existingIndex = this.state.accumulatedSymptoms.findIndex(s => s.id === c.id);
      if (existingIndex === -1) {
        this.state.accumulatedSymptoms.push({
          id: c.id,
          name: c.name,
          weight: c.weight || 0.5,
          red_flag: !!c.red_flag
        });
      }
    }

    // 2. Set chief complaint if null
    if (!this.state.chiefComplaint && this.state.accumulatedSymptoms.length > 0) {
      const firstSym = this.state.accumulatedSymptoms[0];
      this.state.chiefComplaint = firstSym.name?.rur || firstSym.name?.en || firstSym.id;
    }

    // 3. Update timeline
    const extractedTimeline = this.detectTimeline(userText);
    if (extractedTimeline.duration) {
      this.state.timeline.duration = extractedTimeline.duration;
    }
    if (extractedTimeline.onset) {
      this.state.timeline.onset = extractedTimeline.onset;
    }

    // 4. Update severity trajectory (Deterioration vs Improving vs Stable)
    const detectedTrajectory = this.detectTrajectory(userText);
    if (detectedTrajectory !== 'stable' || this.state.turnCount === 1) {
      this.state.severityTrajectory = detectedTrajectory;
    }

    // 5. Calculate differential conditions
    this.state.differentialConditions = this.calculateDifferentialConditions(
      this.state.accumulatedSymptoms,
      this.state.deniedSymptoms
    );

    // 6. Calculate triage tier (with automatic escalation)
    this.state.triageTier = this.evaluateTriageTier(
      this.state.accumulatedSymptoms,
      this.state.severityTrajectory,
      this.state.differentialConditions,
      userText
    );

    // 7. Calculate severity score (1-10)
    this.state.severityScore = this.calculateSeverityScore(
      this.state.triageTier,
      this.state.severityTrajectory,
      this.state.accumulatedSymptoms
    );

    return this.getState();
  }
}

// Singleton ClinicalStateManager instance
export const clinicalState = new ClinicalStateManager();

// Standalone convenience exports
export const update = (userText) => clinicalState.update(userText);
export const getState = () => clinicalState.getState();
export const reset = () => clinicalState.reset();

/**
 * Advanced Context-Aware Multi-Turn Clinical Session State (for ConversationEngine)
 */
export class ClinicalState {
  constructor(initialData = {}) {
    this.reset(initialData);
  }

  reset(initialData = {}) {
    this.sessionStartTime = new Date().toISOString();
    this.turnCount = 0;
    this.chiefComplaint = initialData.chiefComplaint || null;
    this.activeTopic = 'symptom_intake';
    this.clinicalStage = 'intake';

    this.symptoms = new Map();
    this.pertinentNegatives = new Set();

    this.patientProfile = {
      age: initialData.age || null,
      sex: initialData.sex || 'any',
      isPregnant: initialData.isPregnant || false,
      chronicConditions: initialData.chronicConditions || [],
      medications: initialData.medications || [],
      allergies: initialData.allergies || []
    };

    this.uploadedReports = [];
    this.questionsAsked = [];
    this.questionsAnswered = [];
    this.pendingQuestions = [];
    this.corrections = [];

    this.safetyStatus = {
      isUrgent: false,
      tier: 3,
      reasons: [],
      redFlags: []
    };

    this.routing = {
      specialtyId: 'gp',
      specialtyEn: 'General Physician',
      specialtyUr: 'جنرل فزیشن',
      specialtyRur: 'General Physician',
      careLevel: 'Routine Clinic Consultation',
      recommendedDoctor: null,
      rationale: ''
    };

    this.language = initialData.language || 'rur';
    this.communicationStyle = 'concise_empathetic';
    this.conversationSummary = '';
  }

  detectAndUpdateLanguage(text) {
    if (!text || typeof text !== 'string') return this.language;

    const urduRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
    if (urduRegex.test(text)) {
      this.language = 'ur';
      return 'ur';
    }

    const romanUrduWords = [
      'hai', 'hain', 'mujhe', 'mera', 'meri', 'kya', 'kyun', 'kese', 'kaise', 
      'dard', 'bukhar', 'takleef', 'seene', 'sar', 'pait', 'gala', 'khoon', 
      'ulti', 'dast', 'chakkar', 'kamzori', 'theek', 'nahi', 'nahin', 'bohat', 
      'zyada', 'ziada', 'din', 'hafte', 'saal', 'kal', 'aaj', 'subah', 'raat',
      'dawao', 'dawai', 'doctor', 'mashwara', 'bataiye', 'karein', 'salam'
    ];
    
    const words = text.toLowerCase().split(/\s+/);
    let romanMatchCount = 0;
    for (const w of words) {
      if (romanUrduWords.includes(w)) {
        romanMatchCount++;
      }
    }

    if (romanMatchCount >= 2 || (words.length <= 4 && romanMatchCount >= 1)) {
      this.language = 'rur';
      return 'rur';
    }

    if (/[a-zA-Z]/.test(text) && romanMatchCount === 0) {
      this.language = 'en';
      return 'en';
    }

    return this.language;
  }

  recordSymptom(symptomObj, attributes = {}) {
    const id = symptomObj.id;
    const existing = this.symptoms.get(id);

    if (existing) {
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null) {
          if (existing[key] && existing[key] !== value) {
            this.corrections.push({
              symptomId: id,
              field: key,
              previousValue: existing[key],
              newValue: value,
              turn: this.turnCount
            });
          }
          existing[key] = value;
        }
      }
      existing.lastUpdatedTurn = this.turnCount;
      this.symptoms.set(id, existing);
      return existing;
    }

    const newSymptom = {
      id,
      name: symptomObj.name || { en: id, ur: id, rur: id },
      onset: attributes.onset || null,
      duration: attributes.duration || null,
      severity: attributes.severity || null,
      location: attributes.location || null,
      character: attributes.character || null,
      progression: attributes.progression || 'stable',
      associatedSymptoms: attributes.associatedSymptoms || [],
      aggravatingRelieving: attributes.aggravatingRelieving || null,
      firstMentionedTurn: this.turnCount,
      lastUpdatedTurn: this.turnCount
    };

    this.symptoms.set(id, newSymptom);

    if (!this.chiefComplaint) {
      this.chiefComplaint = newSymptom.name[this.language] || newSymptom.name.en || id;
    }

    return newSymptom;
  }

  recordNegative(symptomId) {
    this.pertinentNegatives.add(symptomId);
    if (this.symptoms.has(symptomId)) {
      this.corrections.push({
        symptomId,
        field: 'status',
        previousValue: 'present',
        newValue: 'denied',
        turn: this.turnCount
      });
      this.symptoms.delete(symptomId);
    }
  }

  recordQuestionAnswered(questionId, questionText, answerText) {
    this.questionsAnswered.push({
      id: questionId,
      questionText,
      answerText,
      turn: this.turnCount
    });
    this.pendingQuestions = this.pendingQuestions.filter(q => q.id !== questionId);
  }

  hasQuestionBeenAsked(questionId) {
    return this.questionsAsked.some(q => q.id === questionId);
  }

  recordQuestionAsked(questionId, text, category) {
    if (!this.hasQuestionBeenAsked(questionId)) {
      this.questionsAsked.push({
        id: questionId,
        text,
        category,
        turn: this.turnCount
      });
    }
  }

  recordLabResult(labResult) {
    this.uploadedReports.push({
      ...labResult,
      extractedAt: new Date().toISOString()
    });
    if (labResult.status === 'critical_low' || labResult.status === 'critical_high') {
      this.safetyStatus.isUrgent = true;
      this.safetyStatus.tier = 1;
      this.safetyStatus.redFlags.push(`Critical Panic Lab Value: ${labResult.testName} (${labResult.value} ${labResult.unit})`);
      this.clinicalStage = 'emergency_override';
    }
  }

  getMissingClinicalDimensions() {
    if (this.symptoms.size === 0) return ['chief_complaint'];

    const primarySymptom = Array.from(this.symptoms.values())[0];
    const missing = [];

    if (!primarySymptom.duration && !primarySymptom.onset) {
      missing.push('duration');
    }

    const needsLocation = ['headache', 'severe_headache', 'abdominal_pain', 'body_ache', 'joint_pain', 'flank_pain', 'rash'].includes(primarySymptom.id);
    if (needsLocation && !primarySymptom.location) {
      missing.push('location');
    }

    if (!primarySymptom.severity && !primarySymptom.character) {
      missing.push('severity_character');
    }

    if (!primarySymptom.progression || primarySymptom.progression === 'stable') {
      missing.push('progression');
    }

    return missing;
  }

  hasSufficientClinicalInformation() {
    if (this.safetyStatus.tier === 1) return true;
    if (this.symptoms.size === 0) return false;

    const primary = Array.from(this.symptoms.values())[0];
    const hasTimeline = Boolean(primary.duration || primary.onset);
    const hasLocation = Boolean(primary.location);
    const hasCharacter = Boolean(primary.character || primary.severity);

    if (primary.id === 'headache' || primary.id === 'severe_headache') {
      return (hasTimeline && hasLocation && hasCharacter) || this.turnCount >= 4;
    }

    const hasSeverityOrDetails = Boolean(primary.severity || primary.location || primary.character || primary.progression !== 'stable');
    return (hasTimeline && hasSeverityOrDetails) || this.symptoms.size >= 2 || this.turnCount >= 3;
  }

  toClinicalSummaryString() {
    const symList = Array.from(this.symptoms.values()).map(s => {
      let desc = `${s.name.en} (${s.name.rur})`;
      const parts = [];
      if (s.location) parts.push(`Location: ${s.location}`);
      if (s.duration) parts.push(`Duration: ${s.duration}`);
      if (s.severity) parts.push(`Severity: ${s.severity}`);
      if (s.character) parts.push(`Character: ${s.character}`);
      if (s.progression) parts.push(`Progression: ${s.progression}`);
      if (parts.length > 0) desc += ` [${parts.join(', ')}]`;
      return desc;
    }).join('; ') || 'None identified yet';

    const negList = Array.from(this.pertinentNegatives).join(', ') || 'None recorded';
    
    const labsList = this.uploadedReports.map(r => 
      `${r.testName}: ${r.value} ${r.unit} (${r.status.toUpperCase()})`
    ).join('; ') || 'None';

    const askedList = this.questionsAsked.map(q => q.id).join(', ') || 'None';
    const correctionsList = this.corrections.map(c => 
      `${c.symptomId || 'general'}.${c.field}: "${c.previousValue}" -> "${c.newValue}"`
    ).join('; ') || 'None';

    return `
=== STRUCTURED CLINICAL SESSION CONTEXT ===
- Turn: #${this.turnCount} | Stage: ${this.clinicalStage.toUpperCase()} | Active Topic: ${this.activeTopic}
- Language: ${this.language.toUpperCase()} | Chief Complaint: ${this.chiefComplaint || 'Under evaluation'}
- Active Reported Symptoms: ${symList}
- Pertinent Negatives (Patient Denied): ${negList}
- Patient Profile: Age: ${this.patientProfile.age || 'Not stated'}, Sex: ${this.patientProfile.sex}, Pregnant: ${this.patientProfile.isPregnant ? 'YES' : 'NO'}, Chronic Conditions: ${this.patientProfile.chronicConditions.join(', ') || 'None reported'}
- Uploaded Lab Findings: ${labsList}
- Questions Already Asked (DO NOT REPEAT): [${askedList}]
- Recorded Patient Corrections: [${correctionsList}]
- Triage Urgency: Tier ${this.safetyStatus.tier} (${this.safetyStatus.isUrgent ? 'EMERGENCY RED FLAG ACTIVE' : 'Non-emergency'})
- Assigned Specialty: ${this.routing.specialtyEn} (${this.routing.specialtyUr})
- Care Level: ${this.routing.careLevel}
==========================================`;
  }

  exportSession() {
    return {
      sessionStartTime: this.sessionStartTime,
      turnCount: this.turnCount,
      chiefComplaint: this.chiefComplaint,
      activeTopic: this.activeTopic,
      clinicalStage: this.clinicalStage,
      symptoms: Array.from(this.symptoms.entries()),
      pertinentNegatives: Array.from(this.pertinentNegatives),
      patientProfile: this.patientProfile,
      uploadedReports: this.uploadedReports,
      questionsAsked: this.questionsAsked,
      questionsAnswered: this.questionsAnswered,
      corrections: this.corrections,
      safetyStatus: this.safetyStatus,
      routing: this.routing,
      language: this.language
    };
  }

  importSession(data) {
    if (!data) return;
    this.sessionStartTime = data.sessionStartTime || this.sessionStartTime;
    this.turnCount = data.turnCount || 0;
    this.chiefComplaint = data.chiefComplaint || null;
    this.activeTopic = data.activeTopic || 'symptom_intake';
    this.clinicalStage = data.clinicalStage || 'intake';
    this.symptoms = new Map(data.symptoms || []);
    this.pertinentNegatives = new Set(data.pertinentNegatives || []);
    this.patientProfile = data.patientProfile || this.patientProfile;
    this.uploadedReports = data.uploadedReports || [];
    this.questionsAsked = data.questionsAsked || [];
    this.questionsAnswered = data.questionsAnswered || [];
    this.corrections = data.corrections || [];
    this.safetyStatus = data.safetyStatus || this.safetyStatus;
    this.routing = data.routing || this.routing;
    this.language = data.language || 'rur';
  }
}

export default clinicalState;
