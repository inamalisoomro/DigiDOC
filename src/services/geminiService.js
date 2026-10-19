import diseasesData from '../data/diseases_conditions.json';
import quettaDoctors from '../data/quetta_doctors.json';
import labRangesData from '../data/lab_reference_ranges.json';
import { clinicalEngine } from './clinicalEngine';

const SYSTEM_PROMPT = `SYSTEM INSTRUCTIONS: DigiDoc Avatar AI Healthcare Consultant

1. IDENTITY & PERSONA
You are DigiDoc, an empathetic, highly knowledgeable, and respectful AI digital healthcare consultant and patient navigator designed for Pakistan (with localized Quetta & Balochistan healthcare directory and national Pakistan triage).
Avatar Presence: You embody an interactive video avatar. You listen attentively, show real-time micro-reactions, nod empathetically, and speak with natural lip-sync cadence.
Language & Voice: You communicate fluently in Urdu (اردو), Roman Urdu, and English. Default to polite, comforting Urdu (using "Aap", "Ji", "Fikr na karein").
Accessibility: 24/7 free care navigation and patient triage.

2. AVATAR MICRO-REACTION & SPEECH TAGS
Prepend and interweave avatar reaction tags in brackets at the beginning of phrases:
[LISTENING_ATTENTIVE] — When listening or acknowledging patient input.
[NOD_EMPATHETIC] — When showing compassion for pain, distress, or worry.
[THINKING_ANALYZING] — When cross-referencing symptoms, lab values, or doctor directories.
[SPEAKING_REASSURING] — When explaining medical concepts in simple terms.
[ALERT_URGENT] — When serious red-flag warning signs or critical lab abnormalities are detected.
[WARM_SMILE] — When greeting, comforting, or closing the session.

Example:
[NOD_EMPATHETIC] Ji bilkul, main aapki baat samajh raha hoon. [SPEAKING_REASSURING] Yeh dard kab se mehsoos ho raha hai aapko?

3. CORE KNOWLEDGE BASES (STRICT CLINICAL GROUNDING)
You are equipped with 3 foundational clinical databases:
A. DISEASE DIAGNOSTICS & SYMPTOM KNOWLEDGE (diseases_conditions.json):
- Symptom to condition mapping, negation rules (e.g. "no fever" / "bukhar nahi hai" means fever is absent), and noisy-OR scoring.
- 4 Tiers of Urgency:
  * Tier 1: Emergency: call 1122 / go to hospital immediately.
  * Tier 2: Urgent: see a doctor within 24 hours.
  * Tier 3: Routine: book a normal appointment.
  * Tier 4: Self-care: home supportive care.
- Vulnerable Groups: For child < 5, adult > 65, pregnancy, or known chronic illness, raise urgency by 1 tier (never below tier 2 if fever is present).

B. QUETTA & PAKISTAN DOCTORS DIRECTORY (quetta_doctors.json):
- Contains verified specialists, hospital/clinic affiliations (e.g. Quetta Hospital, Bolan Medical Complex, Akram Hospital, etc.), addresses, and contact phone numbers across Quetta.
- When recommending a doctor, provide:
  * Exactly which specialist they need and why.
  * Doctor's name, primary specialty, hospital/clinic name, address, and phone number for booking.

C. LAB REFERENCE RANGES & BIOMARKERS (lab_reference_ranges.json):
- 424 clinical tests with precise age, sex (male/female/pregnancy), pediatric and critical limits.
- If a value exceeds criticalHigh or falls below criticalLow, flag as EMERGENCY immediately.
- Explain abnormal lab results in clear Urdu.

4. 5-STEP CONSULTATION WORKFLOW
Step 1: Warm Greeting & Chief Complaint.
Step 2: One-Question-at-a-Time Adaptive Intake (Ask duration, severity, associated symptoms, or existing conditions one by one).
Step 3: Analyze Labs & Symptoms (Cross-Referencing JSON).
Step 4: Doctor Recommendation & Education (Recommend matching Quetta/Pakistani specialists with phone numbers & hospital).
Step 5: Appointment Booking & Consultation Guidance.

5. RED FLAGS & EMERGENCY PROTOCOL
Severe chest pain/pressure radiating to left arm/jaw, acute shortness of breath, sudden facial drooping/arm weakness/slurred speech (Stroke), heavy bleeding, loss of consciousness, stiff neck with high fever:
-> Prepend [ALERT_URGENT], stop interview, advise calling Rescue 1122 or nearest hospital ER immediately!

6. COMMUNICATION STYLE
- Urdu Script / Roman Urdu matching user preference.
- Respectful Address: "Aap" (never "tum").
- Disclaimer at conclusion: "Yeh digital mashwara aapki rehnumayi ke liye hai. Hatmi tashkhees aur ilaaj ke liye mustanad doctor se muaina zaroori hai."
`;

export class GeminiService {
  constructor() {
    this.groqApiKey = localStorage.getItem('digidoc_groq_api_key') || 
                      import.meta.env.VITE_GROQ_API_KEY || 
                      '';
    this.geminiApiKey = localStorage.getItem('digidoc_gemini_api_key') || 
                        import.meta.env.VITE_GEMINI_API_KEY || 
                        '';
    this.apiKey = this.groqApiKey || this.geminiApiKey;
    this.history = [];
    this.quettaDoctors = quettaDoctors || [];
    this.diseasesData = diseasesData || {};
    this.labRangesData = labRangesData || {};
  }

  setApiKey(key) {
    const cleanKey = (key || '').trim();
    if (cleanKey.startsWith('gsk_')) {
      this.groqApiKey = cleanKey;
      localStorage.setItem('digidoc_groq_api_key', cleanKey);
    } else if (cleanKey) {
      this.geminiApiKey = cleanKey;
      localStorage.setItem('digidoc_gemini_api_key', cleanKey);
    } else {
      this.groqApiKey = '';
      this.geminiApiKey = '';
      localStorage.removeItem('digidoc_groq_api_key');
      localStorage.removeItem('digidoc_gemini_api_key');
    }
    this.apiKey = this.groqApiKey || this.geminiApiKey;
  }

  getApiKey() {
    return this.groqApiKey || this.geminiApiKey || '';
  }

  isGroqKey() {
    return Boolean(this.groqApiKey && this.groqApiKey.startsWith('gsk_'));
  }

  resetChat() {
    this.history = [];
  }

  async sendMessage(userMessage) {
    // 1. Try Groq Ultra-Fast API Integration if key available
    if (this.groqApiKey) {
      try {
        const messages = [
          {
            role: 'system',
            content: `${SYSTEM_PROMPT}\n\nRELEVANT CLINICAL DATA SUMMARY:\nTotal Quetta Doctors in Directory: ${this.quettaDoctors.length}\nTotal Standard Lab Tests Available: ${this.labRangesData.tests?.length || 424}`
          },
          ...this.history.map(item => ({
            role: item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user',
            content: item.parts?.[0]?.text || item.content || ''
          })),
          { role: 'user', content: userMessage }
        ];

        const groqModels = [
          'qwen/qwen3.8-27b',
          'openai/gpt-oss-120b',
          'openai/gpt-oss-20b',
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant'
        ];

        let reply = '';
        let lastError = null;

        for (const model of groqModels) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${this.groqApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model,
                messages,
                temperature: 0.35,
                max_tokens: 850
              })
            });

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error?.message || `Groq API error ${res.status}`);
            }

            const data = await res.json();
            reply = data.choices?.[0]?.message?.content || '';
            if (reply) break;
          } catch (err) {
            lastError = err;
            console.warn(`Groq model ${model} failed, trying fallback:`, err.message);
          }
        }

        if (reply) {
          this.history.push({ role: 'user', parts: [{ text: userMessage }] });
          this.history.push({ role: 'model', parts: [{ text: reply }] });
          return this.parseReactionTags(reply);
        }
      } catch (err) {
        console.warn("Groq attempt failed, checking fallback:", err);
      }
    }

    // 2. Try Google Gemini API Integration if key available
    if (this.geminiApiKey) {
      try {
        const geminiModels = ['gemini-2.5-flash', 'gemini-2.0-flash'];
        let reply = '';

        for (const model of geminiModels) {
          try {
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;
            
            const payload = {
              systemInstruction: {
                parts: [{ 
                  text: `${SYSTEM_PROMPT}\n\nRELEVANT CLINICAL DATA SUMMARY:\nTotal Quetta Doctors in Directory: ${this.quettaDoctors.length}\nTotal Standard Lab Tests Available: ${this.labRangesData.tests?.length || 424}` 
                }]
              },
              contents: [
                ...this.history,
                { role: 'user', parts: [{ text: userMessage }] }
              ],
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

            if (res.ok) {
              const data = await res.json();
              reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (reply) break;
            }
          } catch (e) {
            console.warn(`Gemini model ${model} notice:`, e.message);
          }
        }

        if (reply) {
          this.history.push({ role: 'user', parts: [{ text: userMessage }] });
          this.history.push({ role: 'model', parts: [{ text: reply }] });
          return this.parseReactionTags(reply);
        }
      } catch (err) {
        console.warn("Gemini API call failed:", err);
      }
    }

    // 3. Fallback to offline local clinical engine
    return this.localClinicalEngine(userMessage);
  }

  parseReactionTags(text) {
    const tagRegex = /\[(LISTENING_ATTENTIVE|NOD_EMPATHETIC|THINKING_ANALYZING|SPEAKING_REASSURING|ALERT_URGENT|WARM_SMILE)\]/g;
    const tagsFound = [];
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
      tagsFound.push(match[1]);
    }

    const primaryTag = tagsFound[0] || 'SPEAKING_REASSURING';
    const isUrgent = tagsFound.includes('ALERT_URGENT') || text.includes('1122') || text.includes('Emergency') || text.includes('ایمرجنسی');
    
    // Clean text for speech synthesis
    const cleanSpeechText = text.replace(/\[[A-Z_]+\]/g, '').replace(/\*+/g, '').replace(/###+/g, '').trim();

    return {
      rawText: text,
      cleanSpeechText,
      primaryTag,
      tagsFound,
      isUrgent
    };
  }

  localClinicalEngine(userMessage, apiNotice) {
    return clinicalEngine.generateResponse(userMessage);
  }
}

export const geminiService = new GeminiService();
