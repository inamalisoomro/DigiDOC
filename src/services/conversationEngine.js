// Context-Aware, Dynamic Conversation Engine for DigiDoc

import { ClinicalState } from './clinicalState.js';
import { safetyLayer } from './safetyLayer.js';
import { reportParser } from './reportParser.js';
import { medicalRoutingPipeline } from './medicalRoutingPipeline.js';

export class ConversationEngine {
  constructor() {
    this.state = new ClinicalState();
    this.conversationHistory = []; // { role: 'user' | 'assistant', text: string, turn: number }
  }

  reset() {
    this.state = new ClinicalState();
    this.conversationHistory = [];
  }

  getState() {
    return this.state;
  }

  // Ingest and process a user utterance through the full multi-tier clinical pipeline
  processUserUtterance(userText) {
    if (!userText || typeof userText !== 'string') {
      return { action: 'no_input' };
    }

    this.state.turnCount++;
    const text = userText.trim();
    const lower = text.toLowerCase();

    // 1. Detect and adapt language
    this.state.detectAndUpdateLanguage(text);

    // 2. Check for User Corrections (e.g. "not left side, right side", "galt bola, dayen taraf hai", "actually right")
    const correctionRegex = /(?:not|nahin|nahi|galt|actually|wrong|instead|dayen|baen|right|left|yesterday|aaj|today|din)\s+(?:side|taraf|se|hissa)?/i;
    const correctionMatch = lower.match(/(?:not|nahin|nahi|galt)\s+([a-zA-Z\u0600-\u06FF]+)[,\s]+(?:it is|it's|hai|balke|magar|actually)?\s*([a-zA-Z\u0600-\u06FF]+)?/i);

    if (lower.includes('right') && (lower.includes('not left') || lower.includes('left nahi') || lower.includes('galt'))) {
      for (const [id, sym] of this.state.symptoms.entries()) {
        if (sym.location || id === 'headache' || id === 'abdominal_pain') {
          this.state.corrections.push({
            symptomId: id,
            field: 'location',
            previousValue: sym.location || 'left side',
            newValue: 'right side',
            turn: this.state.turnCount
          });
          sym.location = 'right side';
          this.state.symptoms.set(id, sym);
        }
      }
    } else if (lower.includes('left') && (lower.includes('not right') || lower.includes('right nahi'))) {
      for (const [id, sym] of this.state.symptoms.entries()) {
        if (sym.location || id === 'headache' || id === 'abdominal_pain') {
          this.state.corrections.push({
            symptomId: id,
            field: 'location',
            previousValue: sym.location || 'right side',
            newValue: 'left side',
            turn: this.state.turnCount
          });
          sym.location = 'left side';
          this.state.symptoms.set(id, sym);
        }
      }
    }

    // 3. Extract symptoms with negation awareness
    const { detected, denied } = medicalRoutingPipeline.extractSymptomsWithNegation(text);

    for (const sym of detected) {
      // Extract specific dimensional attributes for this symptom from text
      const attributes = {};

      // Location
      if (lower.includes('right') || lower.includes('dayen') || lower.includes('دائیں')) {
        attributes.location = 'right side';
      } else if (lower.includes('left') || lower.includes('baen') || lower.includes('بائیں')) {
        attributes.location = 'left side';
      } else if (lower.includes('front') || lower.includes('forehead') || lower.includes('maatha')) {
        attributes.location = 'forehead';
      } else if (lower.includes('back') || lower.includes('peechay') || lower.includes('kamar')) {
        attributes.location = 'back';
      }

      // Duration & Timeline
      const timeMatch = text.match(/(\d+\s*(?:days?|din|hafte|weeks?|hours?|ghante|mahine|months?)|yesterday|kal se|aaj se|today|parso|since\s+[a-zA-Z0-9]+)/i);
      if (timeMatch) {
        attributes.duration = timeMatch[0];
      }

      // Character & Quality
      if (lower.includes('throbbing') || lower.includes('tees') || lower.includes('phat raha') || lower.includes('pulsing')) {
        attributes.character = 'throbbing';
      } else if (lower.includes('pressure') || lower.includes('dabao') || lower.includes('bojh') || lower.includes('heavy') || lower.includes('tightness')) {
        attributes.character = 'pressure / dull tightness';
      } else if (lower.includes('sharp') || lower.includes('tez') || lower.includes('chubh')) {
        attributes.character = 'sharp';
      } else if (lower.includes('burning') || lower.includes('jalan')) {
        attributes.character = 'burning';
      }

      // Severity
      if (lower.includes('severe') || lower.includes('shadeed') || lower.includes('bohat zyada') || lower.includes('unbearable') || lower.includes('10/10') || lower.includes('9/10')) {
        attributes.severity = 'severe';
      } else if (lower.includes('mild') || lower.includes('halka') || lower.includes('thora')) {
        attributes.severity = 'mild';
      } else if (lower.includes('moderate') || lower.includes('darmiyana')) {
        attributes.severity = 'moderate';
      }

      // Progression
      if (lower.includes('worse') || lower.includes('worsening') || lower.includes('barh') || lower.includes('deteriorat')) {
        attributes.progression = 'worsening';
      } else if (lower.includes('better') || lower.includes('improving') || lower.includes('kam ho')) {
        attributes.progression = 'improving';
      }

      this.state.recordSymptom(sym, attributes);
    }

    // Denied symptoms (Pertinent Negatives)
    for (const sym of denied) {
      this.state.recordNegative(sym.id);
    }

    // 4. Check for duration / location standalone answers to earlier questions
    if (detected.length === 0 && this.state.symptoms.size > 0) {
      const primary = Array.from(this.state.symptoms.values())[0];

      // If patient answered location: e.g. "mostly on the right side"
      if (!primary.location && (lower.includes('right') || lower.includes('left') || lower.includes('front') || lower.includes('back') || lower.includes('dayen') || lower.includes('baen'))) {
        let loc = 'localized';
        if (lower.includes('right') || lower.includes('dayen')) loc = 'right side';
        else if (lower.includes('left') || lower.includes('baen')) loc = 'left side';
        else if (lower.includes('front') || lower.includes('forehead')) loc = 'forehead';
        primary.location = loc;
        this.state.recordQuestionAnswered('location', 'Where is the pain located?', loc);
      }

      // If patient answered character: e.g. "throbbing" or "pressure"
      if (!primary.character && (lower.includes('throbbing') || lower.includes('pressure') || lower.includes('tees') || lower.includes('bojh') || lower.includes('sharp') || lower.includes('dull'))) {
        let char = lower.includes('throbbing') || lower.includes('tees') ? 'throbbing' : 'pressure';
        primary.character = char;
        this.state.recordQuestionAnswered('character', 'Is it throbbing or pressure?', char);
      }

      // If patient answered duration: e.g. "three days", "3 din se", "since yesterday"
      const timeMatch = text.match(/(\d+\s*(?:days?|din|hafte|weeks?|hours?|ghante)|yesterday|kal se|aaj se|today|parso)/i);
      if (timeMatch && !primary.duration) {
        primary.duration = timeMatch[0];
        this.state.recordQuestionAnswered('duration', 'How long has this been going on?', timeMatch[0]);
      }

      // If patient answered severity
      if (!primary.severity && (lower.includes('tez') || lower.includes('halka') || lower.includes('severe') || lower.includes('mild') || lower.includes('moderate'))) {
        let sev = lower.includes('tez') || lower.includes('severe') ? 'severe' : (lower.includes('halka') || lower.includes('mild') ? 'mild' : 'moderate');
        primary.severity = sev;
        this.state.recordQuestionAnswered('severity', 'How severe is the pain?', sev);
      }
    }

    // 5. Parse any embedded lab report biomarkers
    const labResults = reportParser.parseReportText(text, this.state.patientProfile);
    for (const lab of labResults) {
      this.state.recordLabResult(lab);
      this.state.activeTopic = 'report_analysis';
    }

    // 6. Run Safety Layer Assessment (Pre-empts everything if emergency)
    const safetyCheck = safetyLayer.evaluate(text, this.state);
    if (safetyCheck.isUrgent) {
      this.state.safetyStatus = safetyCheck;
      this.state.clinicalStage = 'emergency_override';
      return {
        isEmergency: true,
        response: safetyCheck.emergencyGuidance
      };
    }

    // 7. Update routing recommendation
    this.state.routing = medicalRoutingPipeline.routePatient(this.state);

    // 8. Determine topic changes (e.g. asking a medicine question, asking about doctors, general chit-chat)
    if (lower.includes('panadol') || lower.includes('paracetamol') || lower.includes('dawai') || lower.includes('medicine') || lower.includes('tablet') || lower.includes('goli')) {
      this.state.activeTopic = 'medication_inquiry';
    } else if (lower.includes('doctor') || lower.includes('clinic') || lower.includes('hospital') || lower.includes('appointment')) {
      this.state.activeTopic = 'specialist_referral';
    } else if (this.state.turnCount === 1 && (lower === 'hi' || lower === 'hello' || lower === 'salam' || lower === 'assalam o alaikum' || lower.length < 4)) {
      this.state.activeTopic = 'greeting';
    } else if (this.state.symptoms.size > 0) {
      this.state.activeTopic = 'symptom_exploration';
    }

    return {
      isEmergency: false,
      state: this.state
    };
  }

  // Generate an intelligent, natural local response without robotic templates
  generateLocalResponse(userMessage) {
    const pipelineResult = this.processUserUtterance(userMessage);

    // If emergency triggered by safety layer, return immediately
    if (pipelineResult.isEmergency) {
      return pipelineResult.response;
    }

    const state = this.state;
    const lang = state.language;
    const primarySymptom = Array.from(state.symptoms.values())[0];

    // Topic: Greeting
    if (state.activeTopic === 'greeting' && state.turnCount === 1) {
      return this.formatGreeting(lang);
    }

    // Topic: Report Analysis
    if (state.activeTopic === 'report_analysis' && state.uploadedReports.length > 0) {
      const explanation = reportParser.formatExplanation(state.uploadedReports, lang);
      return {
        rawText: `[THINKING_ANALYZING] ${explanation}\n\n[TIER: ${state.safetyStatus.tier}]\n[ACTION: ${state.safetyStatus.tier === 1 ? 'ESCALATE_EMERGENCY' : 'RECOMMEND_DOCTOR'}]\n[SPECIALIST: ${state.routing.specialtyEn}]\n[SUGGESTED_LABS: None]`,
        cleanSpeechText: explanation.replace(/[*#•`\-_]+/g, ' ').replace(/\n+/g, ' ').trim(),
        primaryTag: 'THINKING_ANALYZING'
      };
    }

    // Topic: Medication Inquiry
    if (state.activeTopic === 'medication_inquiry') {
      return this.formatMedicationAdvice(lang);
    }

    // If we have corrections to acknowledge (e.g. "not left, right side")
    const recentCorrection = state.corrections.find(c => c.turn === state.turnCount);
    let correctionAck = '';
    if (recentCorrection) {
      if (lang === 'ur') {
        correctionAck = `سمجھ گیا، ${recentCorrection.newValue} کی طرف۔ `;
      } else if (lang === 'en') {
        correctionAck = `Got it, on the ${recentCorrection.newValue} instead. `;
      } else {
        correctionAck = `Samajh gaya, ${recentCorrection.newValue} par. `;
      }
    }

    // If no symptoms recognized at all
    if (!primarySymptom) {
      return this.formatClarification(lang);
    }

    // Determine what information is missing to decide next conversational step
    const missing = state.getMissingClinicalDimensions();
    const symName = primarySymptom.name[lang] || primarySymptom.name.en || primarySymptom.id;

    // Check if sufficient information gathered to provide clear recommendation
    if (state.hasSufficientClinicalInformation()) {
      return this.formatClinicalRecommendation(lang, correctionAck);
    }

    // Otherwise, ask ONE targeted high-yield follow-up question
    return this.askNextTargetedQuestion(lang, primarySymptom, missing, correctionAck);
  }

  // Ask at most ONE focused follow-up question that differentiates candidate conditions
  askNextTargetedQuestion(lang, symptom, missing, prefixAck = '') {
    const symName = symptom.name[lang] || symptom.name.rur || symptom.name.en;

    // 1. If location is missing for a localized pain
    if (missing.includes('location') && !this.state.hasQuestionBeenAsked('location')) {
      this.state.recordQuestionAsked('location', 'Where exactly is the pain?', 'location');
      if (lang === 'ur') {
        return {
          rawText: `[NOD_EMPATHETIC] ${prefixAck}آپ کی تکلیف سن کر افسوس ہوا۔ یہ درد سر کے کس حصے میں ہے (دائیں طرف، بائیں طرف، یا ماتھے پر)؟`,
          cleanSpeechText: `${prefixAck}Yeh dard sar ke kis hissay mein hai? Dayen taraf, baen taraf ya maathay par?`,
          primaryTag: 'NOD_EMPATHETIC'
        };
      }
      if (lang === 'en') {
        return {
          rawText: `[NOD_EMPATHETIC] ${prefixAck}I'm sorry you're dealing with that. Where exactly is the pain located?`,
          cleanSpeechText: `${prefixAck}I am sorry you are dealing with that. Where exactly is the pain located?`,
          primaryTag: 'NOD_EMPATHETIC'
        };
      }
      return {
        rawText: `[NOD_EMPATHETIC] ${prefixAck}Main samajh sakta hoon. Yeh ${symName} sar ke kis hissay mein mehsoos ho raha hai (dayen taraf, baen taraf, ya samnay)?`,
        cleanSpeechText: `${prefixAck}Main samajh sakta hoon. Yeh dard sar ke kis hissay mein mehsoos ho raha hai?`,
        primaryTag: 'NOD_EMPATHETIC'
      };
    }

    // 2. If duration is missing
    if (missing.includes('duration') && !this.state.hasQuestionBeenAsked('duration')) {
      this.state.recordQuestionAsked('duration', 'How long has this been going on?', 'timeline');
      if (lang === 'ur') {
        return {
          rawText: `[LISTENING_ATTENTIVE] ${prefixAck}یہ تکلیف آپ کو کتنے عرصے سے ہے (مثلاً کل سے، دو تین دن سے، یا اس سے زیادہ)؟`,
          cleanSpeechText: `${prefixAck}Yeh takleef aapko kitne arsay se hai?`,
          primaryTag: 'LISTENING_ATTENTIVE'
        };
      }
      if (lang === 'en') {
        return {
          rawText: `[LISTENING_ATTENTIVE] ${prefixAck}How long has this been going on?`,
          cleanSpeechText: `${prefixAck}How long has this been going on?`,
          primaryTag: 'LISTENING_ATTENTIVE'
        };
      }
      return {
        rawText: `[LISTENING_ATTENTIVE] ${prefixAck}Yeh takleef aapko kab se hai (jaise kal se, 2-3 din se, ya kai hafton se)?`,
        cleanSpeechText: `${prefixAck}Yeh takleef aapko kab se hai?`,
        primaryTag: 'LISTENING_ATTENTIVE'
      };
    }

    // 3. If character / quality is missing
    if (missing.includes('severity_character') && !this.state.hasQuestionBeenAsked('character')) {
      this.state.recordQuestionAsked('character', 'Is it throbbing or pressure?', 'character');
      if (lang === 'ur') {
        return {
          rawText: `[THINKING_ANALYZING] ${prefixAck}کیا یہ درد دھڑکنے یا کسکنے والا (throbbing) ہے، یا دباؤ اور کھنچاؤ کی طرح محسوس ہوتا ہے؟`,
          cleanSpeechText: `${prefixAck}Kya yeh dard dharakne wala hai ya dabao ki tarah mehsoos hota hai?`,
          primaryTag: 'THINKING_ANALYZING'
        };
      }
      if (lang === 'en') {
        return {
          rawText: `[THINKING_ANALYZING] ${prefixAck}Got it. Is it more of a throbbing pain, or does it feel like a dull pressure or tightness?`,
          cleanSpeechText: `${prefixAck}Is it more of a throbbing pain or does it feel like pressure?`,
          primaryTag: 'THINKING_ANALYZING'
        };
      }
      return {
        rawText: `[THINKING_ANALYZING] ${prefixAck}Kya yeh tees uthne wala (throbbing) dard hai, ya dabao aur bojh ki tarah lagta hai?`,
        cleanSpeechText: `${prefixAck}Kya yeh tees uthne wala dard hai ya dabao ki tarah lagta hai?`,
        primaryTag: 'THINKING_ANALYZING'
      };
    }

    // 4. Progression inquiry
    if (!this.state.hasQuestionBeenAsked('progression')) {
      this.state.recordQuestionAsked('progression', 'Is it getting worse or staying the same?', 'progression');
      if (lang === 'ur') {
        return {
          rawText: `[LISTENING_ATTENTIVE] ${prefixAck}کیا یہ درد وقت کے ساتھ بڑھ رہا ہے، یا ایک جیسا ہی رہتا ہے؟`,
          cleanSpeechText: `${prefixAck}Kya yeh dard waqt ke sath barh raha hai ya ek jesa rehta hai?`,
          primaryTag: 'LISTENING_ATTENTIVE'
        };
      }
      if (lang === 'en') {
        return {
          rawText: `[LISTENING_ATTENTIVE] ${prefixAck}Has it been getting worse over time, or has it stayed about the same?`,
          cleanSpeechText: `${prefixAck}Has it been getting worse over time or stayed about the same?`,
          primaryTag: 'LISTENING_ATTENTIVE'
        };
      }
      return {
        rawText: `[LISTENING_ATTENTIVE] ${prefixAck}Kya yeh takleef waqt ke sath barh rahi hai ya aik jesi rehti hai?`,
        cleanSpeechText: `${prefixAck}Kya yeh takleef waqt ke sath barh rahi hai ya aik jesi rehti hai?`,
        primaryTag: 'LISTENING_ATTENTIVE'
      };
    }

    // Fallback: provide recommendation
    return this.formatClinicalRecommendation(lang, prefixAck);
  }

  // Format final clinically grounded recommendation without pretending definitive diagnosis
  formatClinicalRecommendation(lang, prefixAck = '') {
    const state = this.state;
    const routing = state.routing;
    const doc = routing.recommendedDoctor;
    const primarySym = Array.from(state.symptoms.values())[0];
    const symDesc = primarySym ? `${primarySym.name[lang] || primarySym.name.rur || primarySym.id}` : 'alamaat';

    if (lang === 'ur') {
      return {
        rawText: `[SPEAKING_REASSURING] ${prefixAck}آپ کی فراہم کردہ معلومات کی روشنی میں:
علامات کے جائزے سے ظاہر ہوتا ہے کہ آپ کو **${routing.specialtyUr}** (${routing.specialtyEn}) سے تفصیلی معائنہ کروانا چاہیے۔

- **ممکنہ سبب:** علامات مائیگرین یا اعصابی کھنچاؤ کی طرف اشارہ کر سکتی ہیں، تاہم حتمی تشخیص ڈاکٹر کے بالمشافہ معائنے سے ہی ممکن ہے۔
- **تجویز کردہ ڈاکٹر:** ${doc ? `**${doc.name}** (${doc.primarySpecialty} - ${doc.hospitalOrClinic || 'کوئٹہ ہسپتال'})` : 'کوئٹہ سول ہسپتال'}
- **ابتدائی احتیاط:** پُرسکون اور کم روشنی والے کمرے میں آرام کریں اور پانی کا مناسب استعمال کریں۔ کسی بھی ہنگامی علامت کی صورت میں فوری رجوع کریں۔

[TIER: ${routing.tier}]
[ACTION: RECOMMEND_DOCTOR]
[SPECIALIST: ${routing.specialtyEn}]
[SUGGESTED_LABS: Routine CBC, Blood Pressure Check]`,
        cleanSpeechText: `${prefixAck}Aapki alamaat ke mutabiq ${routing.specialtyRur} se muaina behtar rahega. Aaram karein aur hydration ka khayal rakhein.`,
        primaryTag: 'SPEAKING_REASSURING'
      };
    }

    if (lang === 'en') {
      return {
        rawText: `[SPEAKING_REASSURING] ${prefixAck}Based on everything you've shared (symptom pattern, location, and duration):
I recommend having this evaluated by a **${routing.specialtyEn}**.

- **Clinical Rationale:** The combination of symptoms suggests a possible migraine or primary headache disorder. A physician can perform a neurological exam and prescribe targeted management.
- **Recommended Specialist:** ${doc ? `**Dr. ${doc.name}** (${doc.primarySpecialty} at ${doc.hospitalOrClinic || 'Quetta Hospital'})` : 'General Hospital Specialist Clinic'}
- **Next Steps & Home Care:** Rest in a quiet, dimly lit room, stay well hydrated, and keep a brief log of attacks. If you experience sudden thunderclap severity or vision loss, seek urgent medical care.

[TIER: ${routing.tier}]
[ACTION: RECOMMEND_DOCTOR]
[SPECIALIST: ${routing.specialtyEn}]
[SUGGESTED_LABS: Blood Pressure Check, CBC]`,
        cleanSpeechText: `${prefixAck}Based on your symptoms, a consultation with a ${routing.specialtyEn} is recommended. Rest in a dark room and stay well hydrated.`,
        primaryTag: 'SPEAKING_REASSURING'
      };
    }

    // Roman Urdu
    return {
      rawText: `[SPEAKING_REASSURING] ${prefixAck}Aapki faraham karda tafseelat (${symDesc}) ke mutabiq:
Behtar hoga ke aap **${routing.specialtyRur}** (${routing.specialtyEn}) se in-person muaina karwayein.

- **Mumkinah Wajah:** Alamaat migraine ya headache disorder ki taraf ishara karti hain, ta-ham mustanad tashkhees doctor ke muainay se hi hogi.
- **Quetta Specialist:** ${doc ? `**Dr. ${doc.name}** (${doc.primarySpecialty} - ${doc.hospitalOrClinic || 'Quetta Hospital'})` : 'Civil Hospital Quetta'}
- **Gharelu Ehtiyat:** Pur-sukoon andhere kamray mein aaram karein aur pani ka zyada istemal karein. Kisi qisam ki khud-tashkheesi se parhez karein.

[TIER: ${routing.tier}]
[ACTION: RECOMMEND_DOCTOR]
[SPECIALIST: ${routing.specialtyEn}]
[SUGGESTED_LABS: Blood Pressure, CBC]`,
      cleanSpeechText: `${prefixAck}Aapki alamaat ke mutabiq ${routing.specialtyRur} se muaina karwana behtar rahega. Aaram karein aur pani ka istemal rakhein.`,
      primaryTag: 'SPEAKING_REASSURING'
    };
  }

  formatGreeting(lang) {
    if (lang === 'ur') {
      return {
        rawText: `[WARM_SMILE] السلام علیکم! میں DigiDoc ہوں، آپ کا ڈیجیٹل ہیلتھ کیئر معاون۔ [LISTENING_ATTENTIVE] آپ کی صحت کے حوالے سے میں کیا مدد کر سکتا ہوں؟ آپ بول کر یا لکھ کر اپنی علامات بتا سکتے ہیں۔`,
        cleanSpeechText: `Assalam-o-Alaikum! Main DigiDoc hoon. Main aapki sehat ke hawalay se sun raha hoon. Apni takleef batayein.`,
        primaryTag: 'WARM_SMILE'
      };
    }
    if (lang === 'en') {
      return {
        rawText: `[WARM_SMILE] Hello! I'm DigiDoc, your digital healthcare assistant. [LISTENING_ATTENTIVE] How can I help you today? Feel free to describe your symptoms or share a lab report.`,
        cleanSpeechText: `Hello! I am DigiDoc, your digital healthcare assistant. How can I help you today?`,
        primaryTag: 'WARM_SMILE'
      };
    }
    return {
      rawText: `[WARM_SMILE] Assalam-o-Alaikum! Main DigiDoc hoon, aapka digital healthcare consultant. [LISTENING_ATTENTIVE] Main aapki sehat ke hawalay se sun raha hoon. Apni takleef, alamaat ya lab report batayein.`,
      cleanSpeechText: `Assalam-o-Alaikum! Main DigiDoc hoon. Main aapki sehat ke hawalay se sun raha hoon. Apni takleef ya alamaat batayein.`,
      primaryTag: 'WARM_SMILE'
    };
  }

  formatClarification(lang) {
    if (lang === 'ur') {
      return {
        rawText: `[LISTENING_ATTENTIVE] جی، میں توجہ سے سن رہا ہوں۔ برائے مہربانی اپنی تکلیف یا علامات (جیسے بخار، کھانسی، سر درد، یا پیٹ کا مسئلہ) کے بارے میں مزید واضح بتائیں تاکہ میں مناسب رہنمائی کر سکوں۔`,
        cleanSpeechText: `Ji, main sun raha hoon. Baraye meharbani apni alamaat ke baray mein mazeed wazeh batayein.`,
        primaryTag: 'LISTENING_ATTENTIVE'
      };
    }
    if (lang === 'en') {
      return {
        rawText: `[LISTENING_ATTENTIVE] I'm listening. Could you please describe your symptoms in a bit more detail (such as fever, headache, stomach ache, or any lab results) so I can guide you safely?`,
        cleanSpeechText: `I am listening. Could you please describe your symptoms in a bit more detail so I can guide you safely?`,
        primaryTag: 'LISTENING_ATTENTIVE'
      };
    }
    return {
      rawText: `[LISTENING_ATTENTIVE] Ji, main sun raha hoon. Baraye meharbani apni takleef ya alamaat (jaise bukhar, sar dard, khansi ya pait ki kharabi) wazeh alfaaz mein batayein taakay main sahi doctor ki taraf aapki rehnumayi kar sakun.`,
      cleanSpeechText: `Ji, main sun raha hoon. Baraye meharbani apni alamaat wazeh batayein taakay main sahi rehnumayi kar sakun.`,
      primaryTag: 'LISTENING_ATTENTIVE'
    };
  }

  formatMedicationAdvice(lang) {
    if (lang === 'ur') {
      return {
        rawText: `[SPEAKING_REASSURING] عمومی ادویات جیسے پیراسیٹامول (Paracetamol) ہلکے بخار یا درد کے لیے قلیل مدتی ریلیف دیتی ہیں، تاہم کسی بھی اینٹی بائیوٹک یا مستقل دوا کا استعمال مستند معالج کے نسخے کے بغیر نقصان دہ ہو سکتا ہے۔
کیا آپ کو کسی دوا سے الرجی ہے یا آپ پہلے سے کوئی دوا باقاعدگی سے استعمال کر رہے ہیں؟`,
        cleanSpeechText: `Aam bukhar ke liye paracetamol li ja sakti hai, magar mustanad doctor ke mashwaray ke baghair dawai se parhez karein.`,
        primaryTag: 'SPEAKING_REASSURING'
      };
    }
    if (lang === 'en') {
      return {
        rawText: `[SPEAKING_REASSURING] Over-the-counter medications like Paracetamol / Acetaminophen can provide temporary relief for mild pain or fever. However, antibiotics and stronger prescriptions should only ever be taken under a doctor's explicit direction.
Do you have any known drug allergies or are you taking any regular medications?`,
        cleanSpeechText: `Over the counter pain relief can help temporarily, but please avoid antibiotics without a doctor's prescription. Do you have any allergies?`,
        primaryTag: 'SPEAKING_REASSURING'
      };
    }
    return {
      rawText: `[SPEAKING_REASSURING] Aam takleef ya bukhar ke liye Paracetamol qaleel muddat ke liye li ja sakti hai, ta-ham kisi bhi antibiotic ya heavy medicine ka istemal mustanad doctor ke nuskhe ke baghair hargiz na karein.
Kya aapko kisi dawai se allergy hai ya aap pehle se koi regular dawai le rahe hain?`,
      cleanSpeechText: `Aam bukhar ke liye paracetamol li ja sakti hai, magar doctor ke mashwaray ke baghair dawai se parhez karein.`,
      primaryTag: 'SPEAKING_REASSURING'
    };
  }
}

export const conversationEngine = new ConversationEngine();
