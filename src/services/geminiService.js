import diseasesData from '../data/diseases_conditions.json';
import quettaDoctors from '../data/quetta_doctors.json';
import labRangesData from '../data/lab_reference_ranges.json';
import { clinicalEngine } from './clinicalEngine';

const SYSTEM_PROMPT = `SYSTEM INSTRUCTIONS: DigiDoc AI Adaptive Clinical Physician & Triage Consultant

1. IDENTITY & PERSONA
You are DigiDoc, an experienced, deeply empathetic, and clinically sharp digital physician and patient triage consultant in Pakistan (with specialized grounding in Balochistan/Quetta healthcare infrastructure and national emergency protocols).
- Avatar Presence: You embody an interactive video physician. You express real-time clinical empathy, thoughtful analysis, and reassuring bedside manner.
- Language & Tone: You communicate fluently in polite Urdu (اردو), natural Roman Urdu, or English matching patient input. Always use respectful address ("Aap", "Ji", "Fikr na karein").
- Bedside Manner: Empathetic, calm, decisive, and never robotic.

2. ANTI-SCRIPTING & DYNAMIC CLINICAL REASONING RULES (CRITICAL)
- NEVER READ A PRE-DETERMINED SCRIPT OR QUESTIONNAIRE.
- CONTEXT CONTINUITY: Always remember and build upon everything the patient previously shared. Never ask for information the patient already provided.
- DETERIORATION AWARENESS: If the patient reports their condition is worsening, escalating, or that they are "ailing more" (e.g., "bukhar barh raha hai", "pain is worse", "feeling weaker", "chills/shivering", "alimaat barh rahi hain"):
  * IMMEDIATELY acknowledge the escalation with clinical empathy ([NOD_EMPATHETIC] or [ALERT_URGENT]).
  * ESCALATE the urgency tier immediately.
  * Stop asking casual background questions. Shift focus to ruling out acute emergencies and providing decisive clinical triage.
- DISCRIMINATIVE INQUIRY (ONE QUESTION ONLY):
  * When more diagnostic information is needed, ask at most ONE high-yield, targeted question per response that differentiates candidate conditions (e.g. "Along with this worsening fever, is there any neck stiffness, skin rash, or severe shivering?").
  * Do NOT barrage the patient with multi-part questions or repeated baseline questions.
- ACTIONABLE MEDICAL GUIDANCE:
  * When the picture is clear or worsening, provide concrete, safe supportive care (hydration/ORS, fever management precautions, rest) and recommend the appropriate Quetta/Pakistani specialist.
  * Clearly inform the patient what danger signs must trigger an immediate visit to the nearest Emergency Room (Civil Hospital Quetta / BMC / NICVD).

3. AVATAR MICRO-REACTIONS (Interweave at beginning of key thoughts):
- [LISTENING_ATTENTIVE] — Listening carefully or acknowledging user input.
- [NOD_EMPATHETIC] — Empathizing with suffering, pain, distress, or worsening symptoms.
- [THINKING_ANALYZING] — Evaluating differential diagnoses, lab values, or specialist matching.
- [SPEAKING_REASSURING] — Explaining medical concepts, giving reassuring guidance and home care.
- [ALERT_URGENT] — Triggered on Tier 1 emergency red flags or severe sudden deterioration.
- [WARM_SMILE] — Greeting or concluding with warm wishes.

4. STRUCTURED MACHINE-READABLE ACTION TAGS (MANDATORY AT END OF RESPONSE)
Every single response MUST conclude with a block of machine-readable clinical tags at the very bottom:
[TIER: 1|2|3|4]
[ACTION: ESCALATE_EMERGENCY|RECOMMEND_DOCTOR|ORDER_LABS|HOME_CARE]
[SPECIALIST: Specialty Name or General Physician]
[SUGGESTED_LABS: Test1, Test2 or None]

Tier Definitions:
- Tier 1: Emergency (Life-threatening, acute chest pain, severe dyspnea, stroke signs, severe hemorrhage -> Call 1122 or visit ER immediately).
- Tier 2: Urgent (Worsening illness, persistent high fever, significant pain -> In-person doctor visit within 12-24 hours).
- Tier 3: Routine (Stable mild symptoms -> Book routine clinic appointment).
- Tier 4: Self-Care (Minor self-limiting issues -> Supportive home care).
`;

export class GeminiService {
  constructor() {
    this.apiKey = localStorage.getItem('digidoc_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
    this.history = [];
    this.quettaDoctors = quettaDoctors || [];
    this.diseasesData = diseasesData || {};
    this.labRangesData = labRangesData || {};

    // Cumulative multi-turn clinical context tracker
    this.clinicalContext = {
      chiefComplaint: null,
      accumulatedSymptoms: [],
      timeline: null,
      trajectory: 'stable', // 'stable' | 'escalating' | 'improving'
      currentTier: 3,
      redFlags: [],
      suggestedSpecialist: null,
      turnCount: 0
    };
  }

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('digidoc_gemini_api_key', key);
  }

  getApiKey() {
    return this.apiKey;
  }

  resetChat() {
    this.history = [];
    this.clinicalContext = {
      chiefComplaint: null,
      accumulatedSymptoms: [],
      timeline: null,
      trajectory: 'stable',
      currentTier: 3,
      redFlags: [],
      suggestedSpecialist: null,
      turnCount: 0
    };
  }

  // Update clinical context dynamically from user input
  updateClinicalContext(userMessage) {
    this.clinicalContext.turnCount++;
    const text = userMessage.toLowerCase();

    // 1. Detect symptoms via Clinical Engine
    try {
      const detected = clinicalEngine.detectSymptoms(userMessage) || [];
      for (const sym of detected) {
        if (!this.clinicalContext.accumulatedSymptoms.some(s => s.id === sym.id)) {
          this.clinicalContext.accumulatedSymptoms.push(sym);
        }
      }
      if (!this.clinicalContext.chiefComplaint && this.clinicalContext.accumulatedSymptoms.length > 0) {
        const first = this.clinicalContext.accumulatedSymptoms[0];
        this.clinicalContext.chiefComplaint = first.name?.rur || first.name?.en || first.id;
      }
    } catch (e) {
      console.debug("Context symptom tracking:", e);
    }

    // 2. Deterioration and Escalation Detection
    const worseningRegex = /(ailing more|getting worse|worse|worsened|barh gaya|barh rahi|zyada|ziada|shadeed|chills|shivering|severe|deteriorat|tez bukhar|dard barh|takleef barh)/i;
    if (worseningRegex.test(text)) {
      this.clinicalContext.trajectory = 'escalating';
      if (this.clinicalContext.currentTier > 2) {
        this.clinicalContext.currentTier = 2; // Escalate to at least Urgent (Tier 2)
      }
    }

    // 3. Timeline extraction
    const timelineMatch = text.match(/(\d+\s*(din|days?|hafte|weeks?|hours?|ghante)|kal se|yesterday|aaj se|today|parso)/i);
    if (timelineMatch) {
      this.clinicalContext.timeline = timelineMatch[0];
    }

    // 4. Red-flag emergency detection
    const redFlagRegex = /(chest pain|seene me.? dard|seene mein dard|heart attack|saans ruk|shortness of breath|stroke|paralysis|blood in vomit|khoon ki ulti|unconscious|behosh)/i;
    if (redFlagRegex.test(text)) {
      this.clinicalContext.currentTier = 1;
      if (!this.clinicalContext.redFlags.includes('Acute Emergency')) {
        this.clinicalContext.redFlags.push('Acute Emergency');
      }
    }
  }

  async sendMessage(userMessage) {
    // Dynamically update clinical context on every user message
    this.updateClinicalContext(userMessage);

    // If no API key provided, fall back to our clinical engine
    if (!this.apiKey) {
      return this.localClinicalEngine(userMessage);
    }

    try {
      this.history.push({ role: 'user', parts: [{ text: userMessage }] });

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
      
      const clinicalContextSummary = `
CURRENT PATIENT CLINICAL STATE (REAL-TIME CONTEXT):
- Consultation Turn: #${this.clinicalContext.turnCount}
- Chief Complaint: ${this.clinicalContext.chiefComplaint || 'Under active intake'}
- Accumulated Symptoms: ${this.clinicalContext.accumulatedSymptoms.map(s => s.name?.rur || s.name?.en || s.id).join(', ') || 'None identified yet'}
- Timeline / Duration: ${this.clinicalContext.timeline || 'Not stated'}
- Clinical Trajectory: ${this.clinicalContext.trajectory.toUpperCase()} ${this.clinicalContext.trajectory === 'escalating' ? '⚠️ [CRITICAL: Patient reports condition is worsening / ailing more. Immediately acknowledge escalation, prioritize red flags & escalate triage!]' : ''}
- Active Urgency Tier: Tier ${this.clinicalContext.currentTier}
- Known Red Flags: ${this.clinicalContext.redFlags.length ? this.clinicalContext.redFlags.join(', ') : 'None detected so far'}
- Total Quetta Doctors in Local Directory: ${this.quettaDoctors.length}
`;

      const payload = {
        systemInstruction: {
          parts: [{ 
            text: `${SYSTEM_PROMPT}\n\n${clinicalContextSummary}` 
          }]
        },
        contents: this.history,
        generationConfig: {
          temperature: 0.35,
          topP: 0.95,
          maxOutputTokens: 850
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      this.history.push({ role: 'model', parts: [{ text: reply }] });

      return this.parseReactionTags(reply);
    } catch (err) {
      console.warn("Gemini API call failed, running on local clinical knowledge bases:", err);
      return this.localClinicalEngine(userMessage, err.message);
    }
  }

  parseReactionTags(text) {
    if (!text) {
      return {
        rawText: '',
        cleanSpeechText: '',
        primaryTag: 'SPEAKING_REASSURING',
        tagsFound: [],
        isUrgent: false,
        tier: 3,
        action: 'RECOMMEND_DOCTOR',
        specialist: 'General Physician',
        suggestedLabs: []
      };
    }

    // 1. Extract Avatar Reaction Tags
    const reactionRegex = /\[(LISTENING_ATTENTIVE|NOD_EMPATHETIC|THINKING_ANALYZING|SPEAKING_REASSURING|ALERT_URGENT|WARM_SMILE)\]/g;
    const tagsFound = [];
    let match;
    while ((match = reactionRegex.exec(text)) !== null) {
      tagsFound.push(match[1]);
    }
    let primaryTag = tagsFound[0] || 'SPEAKING_REASSURING';

    // 2. Extract Structured Clinical Action Tags
    const tierMatch = text.match(/\[TIER:\s*([1-4])\]/i);
    const tier = tierMatch ? parseInt(tierMatch[1], 10) : (tagsFound.includes('ALERT_URGENT') ? 1 : this.clinicalContext.currentTier || 3);

    const actionMatch = text.match(/\[ACTION:\s*([A-Z_]+)\]/i);
    const action = actionMatch ? actionMatch[1].toUpperCase() : (tier === 1 ? 'ESCALATE_EMERGENCY' : 'RECOMMEND_DOCTOR');

    const specialistMatch = text.match(/\[SPECIALIST:\s*([^\]\n]+)\]/i);
    const specialist = specialistMatch ? specialistMatch[1].trim() : 'General Physician';

    const labsMatch = text.match(/\[SUGGESTED_LABS:\s*([^\]\n]+)\]/i);
    let suggestedLabs = [];
    if (labsMatch) {
      const labsStr = labsMatch[1].trim();
      if (labsStr.toLowerCase() !== 'none') {
        suggestedLabs = labsStr.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const isUrgent = tier === 1 || tagsFound.includes('ALERT_URGENT') || /1122|Emergency|ایمرجنسی/i.test(text);
    if (isUrgent && primaryTag !== 'ALERT_URGENT') {
      primaryTag = 'ALERT_URGENT';
    }

    // Update clinical context specialist
    if (specialist && specialist !== 'General Physician') {
      this.clinicalContext.suggestedSpecialist = specialist;
    }

    // 3. Clean text for natural speech synthesis (strip all reaction tags, action tags, & markdown)
    const cleanSpeechText = text
      .replace(/\[(LISTENING_ATTENTIVE|NOD_EMPATHETIC|THINKING_ANALYZING|SPEAKING_REASSURING|ALERT_URGENT|WARM_SMILE)\]/g, '')
      .replace(/\[(TIER|ACTION|SPECIALIST|SUGGESTED_LABS):[^\]]+\]/gi, '')
      .replace(/\[[A-Za-z0-9_:\s,\-\/\.]+\]/g, '')
      .replace(/[*#_~`]+/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      rawText: text,
      cleanSpeechText,
      primaryTag,
      tagsFound,
      isUrgent,
      tier,
      action,
      specialist,
      suggestedLabs,
      clinicalContext: { ...this.clinicalContext }
    };
  }

  localClinicalEngine(userMessage, apiNotice) {
    const localRes = clinicalEngine.generateResponse(userMessage);
    let rawWithTags = localRes.rawText;

    // Ensure local response also provides machine-readable action tags
    if (!rawWithTags.includes('[TIER:')) {
      const assignedTier = localRes.isUrgent ? 1 : this.clinicalContext.currentTier;
      const assignedAction = assignedTier === 1 ? 'ESCALATE_EMERGENCY' : 'RECOMMEND_DOCTOR';
      const assignedSpecialist = this.clinicalContext.suggestedSpecialist || 'General Physician';
      const assignedLabs = userMessage.toLowerCase().includes('sugar') || userMessage.toLowerCase().includes('lab') ? 'FBS, HbA1c, CBC' : 'None';

      rawWithTags += `\n\n[TIER: ${assignedTier}]\n[ACTION: ${assignedAction}]\n[SPECIALIST: ${assignedSpecialist}]\n[SUGGESTED_LABS: ${assignedLabs}]`;
    }

    return this.parseReactionTags(rawWithTags);
  }
}

export const geminiService = new GeminiService();
