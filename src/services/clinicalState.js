import diseasesData from '../data/diseases_conditions.json';

/**
 * Deterioration keywords across English, Roman Urdu, and Urdu script.
 */
const WORSENING_KEYWORDS = {
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

const IMPROVING_KEYWORDS = {
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

const NEGATION_PATTERNS = [
  // English
  /\b(?:no|not|without|never|denies|haven't|dont have|don't have|did not|didn't)\s+([a-z\s]{2,25})\b/gi,
  // Roman Urdu (e.g. bukhar nahi hai, dard nahi, vomiting nahi hui)
  /([a-z\s]{2,25})\s+\b(?:nahi|nahin|na|baghair|nahi hai|nahin hai|nahi hui|nahin hui)\b/gi,
  // Urdu script
  /([^\s]{2,25})\s*(?:نہیں|نہ|بغیر|نہیں ہے)/g
];

export class ClinicalStateManager {
  constructor() {
    this.symptomsList = diseasesData.symptoms || [];
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
      // If symptom was previously accumulated, remove it
      this.state.accumulatedSymptoms = this.state.accumulatedSymptoms.filter(s => s.id !== d.id);
    }

    // Accumulate confirmed symptoms
    for (const c of confirmed) {
      // Remove from denied if patient now reports it
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

// Export standalone convenience methods matching prompt requirements
export const update = (userText) => clinicalState.update(userText);
export const getState = () => clinicalState.getState();
export const reset = () => clinicalState.reset();

export default clinicalState;
