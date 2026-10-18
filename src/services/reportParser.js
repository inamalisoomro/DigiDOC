// Context-Aware Pathology & Clinical Laboratory Report Parsing Engine for DigiDoc

import labReferenceData from '../data/lab_reference_ranges.json' with { type: 'json' };

export class ReportParser {
  constructor() {
    this.tests = labReferenceData.tests || [];
    this.urduTemplates = labReferenceData.urduTemplates || {};
    this.howToInterpret = labReferenceData.howToInterpret || [];

    // Precompile alias lookup table for high-speed exact matching
    this.aliasMap = new Map();
    for (const test of this.tests) {
      if (test.id) this.aliasMap.set(this.normalizeAlias(test.id), test);
      if (Array.isArray(test.names)) {
        for (const name of test.names) {
          const norm = this.normalizeAlias(name);
          if (norm.length >= 2) {
            this.aliasMap.set(norm, test);
          }
        }
      }
    }
  }

  normalizeAlias(text) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  // Find standard lab test definition by name, alias or ID
  findTest(testName) {
    if (!testName) return null;
    const clean = testName.trim().toLowerCase();
    const norm = this.normalizeAlias(clean);

    if (norm.length < 2) return null;

    // 1. Exact normalized match in alias map
    if (this.aliasMap.has(norm)) {
      return this.aliasMap.get(norm);
    }

    // 2. Exact word match for multi-word aliases
    for (const test of this.tests) {
      for (const name of test.names || []) {
        const testNameLower = name.toLowerCase();
        if (testNameLower.length >= 3 && clean === testNameLower) {
          return test;
        }
      }
    }

    return null;
  }

  // Evaluate a specific numeric value against age and sex specific reference intervals
  evaluateValue(test, rawValue, demographics = {}) {
    const val = parseFloat(rawValue);
    if (isNaN(val)) {
      return {
        testId: test?.id || 'unknown',
        testName: test?.names?.[0] || 'Unknown Test',
        value: rawValue,
        unit: test?.unit || '',
        status: 'qualitative',
        message: 'Non-numeric value recorded.',
        isCritical: false
      };
    }

    const sex = demographics.sex || 'any'; // 'male' | 'female' | 'any'
    const ageYears = demographics.age !== null && demographics.age !== undefined ? parseFloat(demographics.age) : 30;
    const ageInDays = ageYears * 365.25;
    const isPregnant = demographics.isPregnant || false;

    // Pick matching range based on sex, age, and context
    const matchingRange = test.ranges?.find(r => {
      const sexMatches = r.sex === 'any' || r.sex === sex;
      const minDays = r.ageMinDays ?? 0;
      const maxDays = r.ageMaxDays ?? 999999;
      const ageMatches = ageInDays >= minDays && ageInDays < maxDays;

      if (isPregnant && sex === 'female') {
        return sexMatches && (r.context?.includes('pregnancy') || ageMatches);
      }
      return sexMatches && ageMatches;
    }) || test.ranges?.[0];

    if (!matchingRange) {
      return {
        testId: test.id,
        testName: test.names?.[0] || test.id,
        value: val,
        unit: test.unit || '',
        status: 'unknown',
        message: 'Standard reference interval not available for this age/sex bracket.',
        isCritical: false
      };
    }

    let status = 'normal';
    let isCritical = false;

    if (matchingRange.criticalLow !== undefined && val < matchingRange.criticalLow) {
      status = 'critical_low';
      isCritical = true;
    } else if (matchingRange.criticalHigh !== undefined && val > matchingRange.criticalHigh) {
      status = 'critical_high';
      isCritical = true;
    } else if (matchingRange.low !== undefined && val < matchingRange.low) {
      status = 'low';
    } else if (matchingRange.high !== undefined && val > matchingRange.high) {
      status = 'high';
    }

    // Evaluate clinical grade if test defines grades (e.g. diabetes, prediabetes)
    let gradeNote = '';
    if (test.grades && Array.isArray(test.grades)) {
      const matchedGrade = test.grades.find(g => {
        const meetsMin = g.min == null || val >= g.min;
        const meetsMax = g.max == null || val <= g.max;
        return meetsMin && meetsMax;
      });
      if (matchedGrade) {
        gradeNote = `${matchedGrade.label.toUpperCase()}${matchedGrade.clinicalMeaning ? ` (${matchedGrade.clinicalMeaning})` : ''}`;
      }
    }

    return {
      testId: test.id,
      testName: test.names?.[0] || test.id,
      value: val,
      unit: test.unit || '',
      status,
      isCritical,
      referenceRange: {
        low: matchingRange.low,
        high: matchingRange.high,
        criticalLow: matchingRange.criticalLow,
        criticalHigh: matchingRange.criticalHigh
      },
      gradeNote,
      category: test.category
    };
  }

  // Parse natural text (e.g. "FBS: 185 mg/dL, HbA1c: 8.2%, Creatinine: 1.9")
  parseReportText(text, demographics = {}) {
    if (!text || typeof text !== 'string') return [];

    const extracted = [];
    const lines = text.split(/[\n,;]+/);

    // Regular expression: matches [Test Name]: [Numeric Value]
    const testValueRegex = /([a-zA-Z\u0600-\u06FF\s0-9\(\)\/-]+?)\s*(?::|=|\bis\b|\bhai\b|\bwas\b)\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z%µ\/]+)?/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 3) continue;

      const match = trimmed.match(testValueRegex);
      if (match) {
        const candidateName = match[1].trim();
        const candidateVal = match[2];

        // Find standard test
        const test = this.findTest(candidateName);
        if (test) {
          const evalResult = this.evaluateValue(test, candidateVal, demographics);
          extracted.push(evalResult);
        }
      }
    }

    // Direct biomarker search fallback for structured abbreviations (e.g. "fbs 180" or "hba1c 8.5")
    if (extracted.length === 0) {
      const commonTests = [
        { regex: /\b(?:fbs|fasting blood sugar|fasting glucose|fasting sugar|fbg)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'glucose_fasting' },
        { regex: /\b(?:hba1c|haemoglobin a1c|a1c)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'hba1c' },
        { regex: /\b(?:creatinine|serum creatinine)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'creatinine_serum' },
        { regex: /\b(?:hemoglobin|haemoglobin|hb)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'hemoglobin' },
        { regex: /\b(?:platelets|platelet count|plt)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'platelet_count' },
        { regex: /\b(?:wbc|tlc|white blood cells)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'wbc_count' },
        { regex: /\b(?:alt|sgpt)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'alt' },
        { regex: /\b(?:bilirubin|serum bilirubin|total bilirubin)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'bilirubin_total' },
        { regex: /\b(?:tsh|thyroid)\s*(?:is|hai|=|:)?\s*([0-9]+(?:\.[0-9]+)?)/i, id: 'tsh' }
      ];

      for (const item of commonTests) {
        const match = text.match(item.regex);
        if (match) {
          const test = this.tests.find(t => t.id === item.id);
          if (test) {
            extracted.push(this.evaluateValue(test, match[1], demographics));
          }
        }
      }
    }

    return extracted;
  }

  // Format parsed lab results into natural, compassionate clinical commentary
  formatExplanation(parsedResults, language = 'rur') {
    if (!parsedResults || parsedResults.length === 0) {
      if (language === 'ur') {
        return "ہمیں اس دستاویز میں واضح لیب ٹیسٹ پیرامیٹرز نہیں ملے۔ براہ کرم ٹیسٹ کا نام اور ویلیو واضح طور پر درج کریں۔";
      }
      if (language === 'en') {
        return "No standardized laboratory test values could be clearly identified. Please provide the test name and measured value.";
      }
      return "Hamein is tehreer mein koi wazeh lab test reading nahi mili. Baraye meharbani test ka naam aur reading likhein (maslan: FBS 140 mg/dL ya HbA1c 7.5%).";
    }

    const hasCritical = parsedResults.some(r => r.isCritical);
    const lines = [];

    if (hasCritical) {
      if (language === 'ur') {
        lines.push("⚠️ **فوری توجہ کی ضرورت ہے!** آپ کی رپورٹ میں خطرناک حد تک غیر معمولی (Critical Panic) نتائج پائے گئے ہیں:");
      } else if (language === 'en') {
        lines.push("⚠️ **CRITICAL ATTENTION REQUIRED:** Your report contains lab values that exceed critical panic limits:");
      } else {
        lines.push("⚠️ **FAURI TAWAJJOH ZAROORI HAI!** Aapki report mein kuch readings khatarnak had tak ghair mamooli hain:");
      }
    } else {
      if (language === 'ur') {
        lines.push("میں نے آپ کے لیب نتائج کا DigiDoc کے 424 تشخیصی پیرامیٹرز کے ساتھ موازنہ کر لیا ہے:");
      } else if (language === 'en') {
        lines.push("I have reviewed your laboratory findings against DigiDoc's verified clinical reference intervals:");
      } else {
        lines.push("Main ne aapki lab report ka DigiDoc Standard Clinical Intervals ke sath jaiza le liya hai:");
      }
    }

    for (const r of parsedResults) {
      const normalRangeStr = r.referenceRange 
        ? `${r.referenceRange.low ?? 'N/A'} - ${r.referenceRange.high ?? 'N/A'} ${r.unit}`
        : '';

      let statusBadge = r.status.toUpperCase();
      if (r.status === 'normal') statusBadge = 'NORMAL ✓';
      if (r.status === 'high') statusBadge = 'HIGH ⬆️';
      if (r.status === 'low') statusBadge = 'LOW ⬇️';
      if (r.isCritical) statusBadge = 'CRITICAL PANIC 🚨';

      let explanation = `• **${r.testName}**: ${r.value} ${r.unit} — [${statusBadge}]`;
      if (normalRangeStr) explanation += ` (Normal: ${normalRangeStr})`;
      if (r.gradeNote) explanation += ` — *${r.gradeNote}*`;

      lines.push(explanation);
    }

    // Clinical guidance recommendation
    if (hasCritical) {
      if (language === 'ur') {
        lines.push("\nان نتائج کے ساتھ کسی تاخیر کے بغیر فوراً ڈاکٹر یا ہسپتال کے ایمرجنسی وارڈ سے رجوع فرمائیں۔");
      } else if (language === 'en') {
        lines.push("\nGiven these critical results, please consult an emergency physician or specialist immediately without delay.");
      } else {
        lines.push("\nIn readings ke pesh-e-nazar foran mustanad doctor ya hospital se rabta karein. Kisi qisam ki takheer na karein.");
      }
    } else {
      if (language === 'ur') {
        lines.push("\nکیا مریض کو فی الوقت کوئی علامات (جیسے بخار، تھکاوٹ، پیاس، یا سر درد) بھی محسوس ہو رہی ہیں؟");
      } else if (language === 'en') {
        lines.push("\nIs the patient currently experiencing any symptoms related to these results (such as fatigue, excessive thirst, or headache)?");
      } else {
        lines.push("\nKya mareez ko is waqt koi khas alamaat (jaise thakawat, pyas ka zyada lagna, ya kamzori) bhi mehsoos ho rahi hain?");
      }
    }

    return lines.join('\n');
  }
}

export const reportParser = new ReportParser();
