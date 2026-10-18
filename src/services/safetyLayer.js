// Clinical Safety Layer & Emergency Triage Engine for DigiDoc

export class SafetyLayer {
  constructor() {
    this.emergencyHotlines = {
      nationalAmbulance: '1122',
      edhiAmbulance: '115',
      mentalHealthHelpline: '0311-7786264', // Umang Mental Health Helpline (Pakistan)
      quettaEmergencyHospital: 'Civil Hospital Quetta / Bolan Medical Complex (BMC)'
    };
  }

  // Assess user message and clinical state for critical emergency warning signs
  evaluate(userMessage, clinicalState = null) {
    if (!userMessage || typeof userMessage !== 'string') {
      return { isUrgent: false, tier: 3, redFlags: [], emergencyGuidance: null };
    }

    const text = userMessage.toLowerCase();
    const redFlags = [];
    let primaryEmergencyType = null;

    // 1. Acute Coronary Syndrome / Heart Attack Signs
    const acsRegex = /(chest pain|chest tightness|pressure in chest|crushing chest|heart attack|dil ka daura|seene me.? dard|seene mein dard|سینے میں درد|pain left arm|baen bazu mein dard|left arm pain|cold sweat and chest|seene par bojh)/i;
    if (acsRegex.test(text)) {
      redFlags.push('Acute Coronary Syndrome / Suspected Heart Attack');
      primaryEmergencyType = 'cardiac';
    }

    // 2. Stroke / Acute Neurological Emergency (FAST Signs)
    const strokeRegex = /(stroke|facial droop|face drooping|mouth drooping|chehra terha|munh terha|speech difficulty|slurred speech|zubaan ladkhadana|bolne mein dushwari|weakness one side|paralysis|ek taraf kamzori|falij|half body numb|cannot move arm)/i;
    if (strokeRegex.test(text)) {
      redFlags.push('Suspected Acute Stroke (FAST)');
      primaryEmergencyType = 'stroke';
    }

    // 3. Severe Acute Respiratory Distress / Airway Obstruction
    const respiratoryRegex = /(cannot breathe|can't breathe|suffocating|saans band|saans ruk|severe shortness of breath|gasping for air|blue lips|neelay hont|stridor|choking)/i;
    if (respiratoryRegex.test(text)) {
      redFlags.push('Severe Acute Respiratory Distress / Airway Compromise');
      primaryEmergencyType = 'respiratory';
    }

    // 4. Suspected Meningitis / Acute Central Nervous System Infection
    const meningitisRegex = /(stiff neck and fever|gardan akar|neck stiffness|gardan sakht.*bukhar|fever.*stiff neck|severe headache.*stiff neck)/i;
    if (meningitisRegex.test(text)) {
      redFlags.push('Suspected Meningitis (Fever + Neck Stiffness)');
      primaryEmergencyType = 'meningitis';
    }

    // 5. Severe Hemorrhage / Uncontrolled Bleeding / Hematemesis
    const hemorrhageRegex = /(vomiting blood|blood in vomit|khoon ki ulti|خون کی الٹی|coughing up blood|coughing blood|khansi mein khoon|uncontrolled bleeding|bohat zyada khoon beh|black tarry stool|kala pakhana.*khoon)/i;
    if (hemorrhageRegex.test(text)) {
      redFlags.push('Severe Internal / External Hemorrhage');
      primaryEmergencyType = 'hemorrhage';
    }

    // 6. Loss of Consciousness / Syncope / Seizure / Unresponsive
    const consciousnessRegex = /(loss of consciousness|unconscious|behosh|hosh kho|fainted and not waking|seizure.*not stopping|dora parna.*behosh|fits.*unconscious)/i;
    if (consciousnessRegex.test(text)) {
      redFlags.push('Loss of Consciousness / Unresponsive Patient');
      primaryEmergencyType = 'neurological';
    }

    // 7. Anaphylaxis / Severe Systemic Allergic Reaction
    const anaphylaxisRegex = /(anaphylaxis|throat closing|tongue swelling|zaban sooj|lips swelling.*breath|severe allergic reaction|hives.*cannot breathe)/i;
    if (anaphylaxisRegex.test(text)) {
      redFlags.push('Suspected Anaphylaxis / Severe Allergic Airway Obstruction');
      primaryEmergencyType = 'anaphylaxis';
    }

    // 8. Immediate Self-Harm / Suicidal Crisis
    const selfHarmRegex = /(suicide|kill myself|end my life|jaan lena|khudkushi|apne aap ko khatam|want to die|mar jana chahta)/i;
    if (selfHarmRegex.test(text)) {
      redFlags.push('Acute Crisis / Suicidal Ideation Risk');
      primaryEmergencyType = 'crisis';
    }

    // 9. Neonatal / Infant Emergency Danger Signs
    if (clinicalState && (clinicalState.patientProfile.age !== null && clinicalState.patientProfile.age < 0.25)) {
      const neonatalRegex = /(not feeding|doodh nahi pee raha|doodh nahi pi raha|cold body|hypothermia|apnea|saans rukna|bohat sust|lethargic)/i;
      if (neonatalRegex.test(text)) {
        redFlags.push('Critical Neonatal Danger Sign');
        primaryEmergencyType = 'neonatal';
      }
    }

    // 10. Check if any prior critical lab result exists in clinical state
    if (clinicalState && clinicalState.safetyStatus && clinicalState.safetyStatus.tier === 1) {
      if (!primaryEmergencyType) {
        primaryEmergencyType = 'lab_critical';
      }
      for (const rf of clinicalState.safetyStatus.redFlags) {
        if (!redFlags.includes(rf)) redFlags.push(rf);
      }
    }

    const isUrgent = redFlags.length > 0;
    const tier = isUrgent ? 1 : 3;

    let emergencyGuidance = null;
    if (isUrgent) {
      emergencyGuidance = this.generateEmergencyGuidance(primaryEmergencyType, redFlags, clinicalState?.language || 'rur');
    }

    return {
      isUrgent,
      tier,
      redFlags,
      primaryEmergencyType,
      emergencyGuidance
    };
  }

  // Generate decisive, unambiguous emergency instructions based on language
  generateEmergencyGuidance(type, redFlags, language = 'rur') {
    const lang = language === 'ur' ? 'ur' : (language === 'en' ? 'en' : 'rur');

    if (type === 'crisis') {
      if (lang === 'ur') {
        return {
          rawText: `[ALERT_URGENT] ہم آپ کی حفاظت اور زندگی کی قدر کرتے ہیں۔ آپ تنہا نہیں ہیں، اور فوری مدد دستیاب ہے۔
براہ کرم ابھی فوری مدد کے لیے پاکستان مینٹل ہیلتھ ہیلپ لائن Umang پر رابطہ کریں: **0311-7786264** یا فوری طور پر **1122** پر کال کریں یا قریبی ہسپتال کے ایمرجنسی وارڈ تشریف لے جائیں۔ آپ کی زندگی انتہائی قیمتی ہے۔

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Psychiatrist / Crisis Team]
[SUGGESTED_LABS: None]`,
          cleanSpeechText: `Aap akele nahi hain aur foran madad dastiyab hai. Baraye meharbani abhi mental health helpline 0311-7786264 ya rescue 1122 par call karein. Aapki zindagi qeemti hai.`,
          primaryTag: 'ALERT_URGENT'
        };
      }
      if (lang === 'en') {
        return {
          rawText: `[ALERT_URGENT] We care deeply about your life and safety. You are not alone, and immediate compassionate support is available right now.
Please immediately call the Umang Mental Health Crisis Helpline at **0311-7786264**, call emergency services at **1122** (or local emergency 911/999/112), or go to the nearest hospital Emergency Room immediately.

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Psychiatrist / Crisis Team]
[SUGGESTED_LABS: None]`,
          cleanSpeechText: `Please know that you are not alone and support is available right now. Call emergency rescue 1122 or the helpline 0311-7786264 immediately, or go to the nearest emergency room.`,
          primaryTag: 'ALERT_URGENT'
        };
      }
      return {
        rawText: `[ALERT_URGENT] Hum aapki hifazat aur zindagi ki qadar kartay hain. Aap akele nahi hain aur foran madad dastiyab hai.
Baraye meharbani abhi Umang Crisis Helpline par rabta karein: **0311-7786264**, ya Rescue **1122** par call karein ya qareebi hospital ke Emergency Ward jayein.

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Psychiatrist / Crisis Team]
[SUGGESTED_LABS: None]`,
        cleanSpeechText: `Aap akele nahi hain. Baraye meharbani abhi crisis helpline 0311-7786264 ya rescue 1122 par call karein ya foran hospital ke emergency room jayein.`,
        primaryTag: 'ALERT_URGENT'
      };
    }

    // General Clinical Emergency Guidance
    if (lang === 'ur') {
      return {
        rawText: `[ALERT_URGENT] خبردار! یہ علامات شدید طبی خطرے (Emergency Tier 1) کی نشاندہی کرتی ہیں: **${redFlags.join(', ')}**۔
براہ کرم آن لائن چیٹ یا مزید سوالات کا انتظار نہ کریں:
1. فوراً ایمرجنسی ریسکیو **1122** یا ایدھی **115** پر کال کریں۔
2. مریض کو فوری طور پر قریبی ہسپتال (${this.emergencyHotlines.quettaEmergencyHospital}) کے ایمرجنسی روم (ER) لے جائیں۔
3. مریض کو اکیلا نہ چھوڑیں اور خود گاڑی چلانے سے گریز کریں۔

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Emergency Medicine / Interventional Cardiology]
[SUGGESTED_LABS: Emergency ECG, Troponin, CBC, Blood Gas]`,
        cleanSpeechText: `Khabardaar! Yeh alamaat shadeed tibbi khatray ki hain. Kisi qisam ka intizar na karein, foran Emergency Rescue 1122 par call karein ya hospital ke Emergency Room jayein.`,
        primaryTag: 'ALERT_URGENT'
      };
    }

    if (lang === 'en') {
      return {
        rawText: `[ALERT_URGENT] MEDICAL EMERGENCY WARNING (Tier 1): The symptoms described (**${redFlags.join(', ')}**) represent potentially life-threatening warning signs.
Do not delay or wait for routine chat questioning:
1. Call emergency services immediately: **1122** (Pakistan) or your local emergency number (911 / 999 / 112).
2. Go to the nearest hospital Emergency Department (${this.emergencyHotlines.quettaEmergencyHospital}) immediately.
3. Do not attempt to drive yourself. Rest in a safe position while emergency medical services arrive.

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Emergency Medicine]
[SUGGESTED_LABS: Emergency Workup, ECG, Stat Labs]`,
        cleanSpeechText: `Medical emergency warning. These symptoms represent potentially critical warning signs. Call emergency rescue 1122 or go immediately to the nearest hospital emergency room.`,
        primaryTag: 'ALERT_URGENT'
      };
    }

    // Roman Urdu
    return {
      rawText: `[ALERT_URGENT] Khabardaar! Yeh alamaat intehayi sangeen tibbi khatray (Emergency Tier 1) ki nishandahi karti hain: **${redFlags.join(', ')}**۔
Kisi qisam ka intizar na karein aur na hi routine chat mein waqt zaya karein:
1. Foran Emergency Rescue **1122** ya Edhi **115** par call karein.
2. Mareez ko foran qareebi hospital (${this.emergencyHotlines.quettaEmergencyHospital}) ke Emergency Room (ER) le kar jayein.
3. Mareez ko akela na chorein aur khud drive karne se parhez karein.

[TIER: 1]
[ACTION: ESCALATE_EMERGENCY]
[SPECIALIST: Emergency Medicine Specialist]
[SUGGESTED_LABS: Emergency Workup, Stat ECG, CBC]`,
      cleanSpeechText: `Khabardaar! Yeh alamaat intehayi sangeen hain. Kisi qisam ka intizar na karein, foran Emergency Rescue 1122 par call karein ya hospital ke Emergency Room jayein.`,
      primaryTag: 'ALERT_URGENT'
    };
  }
}

export const safetyLayer = new SafetyLayer();
