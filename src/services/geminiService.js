import diseasesData from '../data/diseases_conditions.json';
import quettaDoctors from '../data/quetta_doctors.json';
import labRangesData from '../data/lab_reference_ranges.json';
import { conversationEngine } from './conversationEngine.js';
import { safetyLayer } from './safetyLayer.js';

const MASTER_SYSTEM_PROMPT = `SYSTEM INSTRUCTIONS: DigiDoc AI Adaptive Clinical Physician & Triage Consultant

1. IDENTITY & PERSONA
You are DigiDoc, an experienced, deeply empathetic, and clinically sharp digital physician and patient triage consultant in Pakistan (with specialized grounding in Balochistan/Quetta healthcare infrastructure and national emergency protocols).
- Avatar Presence: You embody an interactive video physician. You express real-time clinical empathy, thoughtful analysis, and reassuring bedside manner.
- Language & Tone: You communicate fluently in polite Urdu (اردو), natural Roman Urdu, or English matching patient input. Always use respectful address ("Aap", "Ji", "Fikr na karein").
- Bedside Manner: Empathetic, calm, decisive, concise, and never robotic.

2. ANTI-SCRIPTING & CONTEXT-AWARE CONVERSATIONAL RULES (MANDATORY)
- NEVER READ A PRE-DETERMINED SCRIPT OR RIGID QUESTIONNAIRE.
- CONTEXT CONTINUITY: Always remember and build upon everything the patient previously shared. NEVER ask for information the patient already provided (e.g. location, duration, severity, onset, or denied symptoms).
- ACKNOWLEDGE CONCERNS: Acknowledge the patient's concern naturally before moving forward.
- DISCRIMINATIVE INQUIRY (ONE QUESTION ONLY):
  * When more clinical information is needed, ask at most ONE high-yield, targeted question per response that differentiates candidate conditions (e.g. "Along with this headache, is there any nausea, neck stiffness, or sensitivity to light?").
  * Do NOT barrage the patient with multi-part questions or repeated baseline questions.
- CORRECTIONS HANDLING:
  * If the patient corrects a previous detail (e.g. "Actually on the right side, not left"), immediately acknowledge the correction and base all clinical reasoning on the corrected information.
- DETERIORATION AWARENESS:
  * If the patient reports their condition is worsening or escalating ("bukhar barh raha hai", "pain is worse", "feeling weaker", "chills"):
  * Immediately acknowledge escalation ([NOD_EMPATHETIC] or [ALERT_URGENT]).
  * Prioritize ruling out acute red flags and escalate triage urgency.
- MEDICAL UNCERTAINTY & HONESTY:
  * Distinguish possibilities from confirmed diagnoses. Do not claim to diagnose definitively from a conversation. Explain clinical reasoning clearly.
- ACTIONABLE MEDICAL GUIDANCE:
  * When sufficient information is available, provide concrete, safe supportive care (hydration/ORS, rest) and recommend the appropriate Pakistani/Quetta medical specialist.

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
    this.apiKey = (typeof localStorage !== 'undefined' ? localStorage.getItem('digidoc_gemini_api_key') : '') || 
      (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GEMINI_API_KEY : '') || 
      'AIzaSyA4UnBLjgVV0frIgBZ0fhWsHF_zW2HjBSM';
    this.history = [];
    this.quettaDoctors = quettaDoctors || [];
    this.diseasesData = diseasesData || {};
    this.labRangesData = labRangesData || {};
    this.currentAbortController = null;
  }

  setApiKey(key) {
    this.apiKey = key;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('digidoc_gemini_api_key', key);
    }
  }

  getApiKey() {
    return this.apiKey;
  }

  resetChat() {
    this.history = [];
    conversationEngine.reset();
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  // Abort any ongoing stream or generation (used during voice barge-in / interruption)
  abortCurrentRequest() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  async sendMessage(userMessage, onChunk = null) {
    // 1. Process through the conversational state engine and safety layer
    const pipelineResult = conversationEngine.processUserUtterance(userMessage);

    // If safety layer triggers an immediate Tier 1 emergency, bypass LLM to eliminate hallucination or latency
    if (pipelineResult.isEmergency) {
      return pipelineResult.response;
    }

    const clinicalState = conversationEngine.getState();

    // If no API key provided, fall back to our context-aware clinical engine
    if (!this.apiKey) {
      return conversationEngine.generateLocalResponse(userMessage);
    }

    // Abort previous in-flight request if any
    this.abortCurrentRequest();
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      this.history.push({ role: 'user', parts: [{ text: userMessage }] });

      // Build structured context string from ClinicalState
      const contextSummary = clinicalState.toClinicalSummaryString();

      // Check if streaming is requested
      if (onChunk && typeof onChunk === 'function') {
        return await this.streamMessage(userMessage, contextSummary, onChunk, signal);
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`;
      const payload = {
        systemInstruction: {
          parts: [{ text: `${MASTER_SYSTEM_PROMPT}\n\n${contextSummary}` }]
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
        body: JSON.stringify(payload),
        signal
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
      if (err.name === 'AbortError') {
        console.log("Gemini request was cancelled by user interruption.");
        return {
          rawText: '',
          cleanSpeechText: '',
          primaryTag: 'LISTENING_ATTENTIVE',
          isAborted: true
        };
      }
      console.warn("Gemini API call failed, falling back to local clinical knowledge engine:", err);
      return conversationEngine.generateLocalResponse(userMessage);
    } finally {
      this.currentAbortController = null;
    }
  }

  // Low-latency SSE streaming generation
  async streamMessage(userMessage, contextSummary, onChunk, signal) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const payload = {
      systemInstruction: {
        parts: [{ text: `${MASTER_SYSTEM_PROMPT}\n\n${contextSummary}` }]
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
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      throw new Error(`Streaming API error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '').trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (textPart) {
              accumulatedText += textPart;
              onChunk(textPart, accumulatedText);
            }
          } catch (e) {}
        }
      }
    }

    this.history.push({ role: 'model', parts: [{ text: accumulatedText }] });
    return this.parseReactionTags(accumulatedText);
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

    const clinicalState = conversationEngine.getState();

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
    const tier = tierMatch ? parseInt(tierMatch[1], 10) : (tagsFound.includes('ALERT_URGENT') ? 1 : clinicalState.safetyStatus.tier || 3);

    const actionMatch = text.match(/\[ACTION:\s*([A-Z_]+)\]/i);
    const action = actionMatch ? actionMatch[1].toUpperCase() : (tier === 1 ? 'ESCALATE_EMERGENCY' : 'RECOMMEND_DOCTOR');

    const specialistMatch = text.match(/\[SPECIALIST:\s*([^\]\n]+)\]/i);
    const specialist = specialistMatch ? specialistMatch[1].trim() : clinicalState.routing.specialtyEn || 'General Physician';

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

    // 3. Clean text for natural speech synthesis
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
      clinicalState: clinicalState.exportSession()
    };
  }
}

export const geminiService = new GeminiService();
