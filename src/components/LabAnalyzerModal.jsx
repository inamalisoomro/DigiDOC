import React, { useState } from 'react';
import { X, Activity, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import labReferenceData from '../data/lab_reference_ranges.json';
import './Modals.css';

export default function LabAnalyzerModal({ onClose, onAskAboutLab }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSex, setSelectedSex] = useState('female'); // Default female as emphasized by user
  const [ageYears, setAgeYears] = useState('28');
  const [inputValue, setInputValue] = useState('');
  const [isPregnant, setIsPregnant] = useState(false);

  const tests = labReferenceData.tests || [];
  const [selectedTest, setSelectedTest] = useState(tests[0] || null);
  const [evaluation, setEvaluation] = useState(null);

  const filteredTests = tests.filter(t => {
    const term = searchTerm.toLowerCase();
    const matchesName = t.names?.some(n => n.toLowerCase().includes(term));
    const matchesId = t.id?.toLowerCase().includes(term);
    const matchesCategory = t.category?.toLowerCase().includes(term);
    return matchesName || matchesId || matchesCategory;
  }).slice(0, 40);

  // Evaluate lab value based on age, gender and clinical limits
  const handleEvaluate = (e) => {
    e.preventDefault();
    if (!selectedTest) return;

    const val = parseFloat(inputValue);
    if (isNaN(val)) return;

    const ageInDays = (parseFloat(ageYears) || 30) * 365.25;

    // Find the matching range rule based on Sex and Age
    const matchingRange = selectedTest.ranges?.find(r => {
      const sexMatches = r.sex === 'any' || r.sex === selectedSex;
      const minDays = r.ageMinDays ?? 0;
      const maxDays = r.ageMaxDays ?? 999999;
      const ageMatches = ageInDays >= minDays && ageInDays < maxDays;
      
      if (isPregnant && selectedSex === 'female') {
        return sexMatches && (r.context?.includes('pregnancy') || ageMatches);
      }
      return sexMatches && ageMatches;
    }) || selectedTest.ranges?.[0];

    if (!matchingRange) {
      setEvaluation({ status: 'unknown', message: 'No standard range found for this specific age/sex bracket.', val });
      return;
    }

    let status = 'normal';
    let message = `آپ کا ${selectedTest.names?.[0] || selectedTest.id} نارمل رینج میں ہے (${matchingRange.low ?? 'N/A'} - ${matchingRange.high ?? 'N/A'} ${selectedTest.unit || ''})۔`;
    let isCritical = false;

    if (matchingRange.criticalLow !== undefined && val < matchingRange.criticalLow) {
      status = 'critical';
      isCritical = true;
      message = `CRITICAL ALERT! آپ کی ویلیو (${val}) خطرناک حد تک کم ہے (Panic Limit < ${matchingRange.criticalLow} ${selectedTest.unit})۔ فوراً ایمرجنسی رجوع کریں۔`;
    } else if (matchingRange.criticalHigh !== undefined && val > matchingRange.criticalHigh) {
      status = 'critical';
      isCritical = true;
      message = `CRITICAL ALERT! آپ کی ویلیو (${val}) خطرناک حد تک زیادہ ہے (Panic Limit > ${matchingRange.criticalHigh} ${selectedTest.unit})۔ فوراً ڈاکٹر یا ہسپتال جائیں۔`;
    } else if (matchingRange.low !== undefined && val < matchingRange.low) {
      status = 'low';
      message = `آپ کا رزلٹ نارمل سے کم ہے (Normal Range: ${matchingRange.low} - ${matchingRange.high} ${selectedTest.unit})۔`;
    } else if (matchingRange.high !== undefined && val > matchingRange.high) {
      status = 'high';
      message = `آپ کا رزلٹ نارمل سے زیادہ ہے (Normal Range: ${matchingRange.low} - ${matchingRange.high} ${selectedTest.unit})۔`;
    }

    // Check custom clinical grades (e.g. prediabetes, diabetes)
    let gradeNote = '';
    if (selectedTest.grades) {
      const matchedGrade = selectedTest.grades.find(g => {
        const meetsMin = g.min === undefined || val >= g.min;
        const meetsMax = g.max === undefined || val < g.max;
        return meetsMin && meetsMax;
      });
      if (matchedGrade) {
        gradeNote = `Classification: ${matchedGrade.label.toUpperCase()} (${matchedGrade.clinicalMeaning || ''})`;
      }
    }

    setEvaluation({
      status,
      isCritical,
      message,
      val,
      gradeNote,
      range: matchingRange,
      unit: selectedTest.unit
    });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card wide-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Activity className="modal-icon" size={24} />
            <div>
              <h3>DigiDoc Pathology & Lab Reference Engine</h3>
              <p className="modal-sub">424 Standardized Biomarkers with Age & Sex-Specific Pediatric, Adult & Pregnancy Intervals</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body lab-modal-layout">
          {/* Left Column: Test Browser */}
          <div className="lab-selector-pane">
            <div className="lab-search-input">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search test (Glucose, HbA1c, CBC, Urea)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="lab-items-list">
              {filteredTests.map(test => (
                <div
                  key={test.id}
                  className={`lab-item-pill ${selectedTest?.id === test.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedTest(test);
                    setEvaluation(null);
                    setInputValue('');
                  }}
                >
                  <span className="lab-name-en">{test.names?.[0] || test.id}</span>
                  <span className="lab-name-ur">{test.category?.toUpperCase()} ({test.unit || 'unit'})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Demographics & Clinical Calculator */}
          <div className="lab-detail-pane">
            {selectedTest && (
              <>
                <div className="selected-test-header">
                  <h4 className="detail-test-name">{selectedTest.names?.[0] || selectedTest.id}</h4>
                  <span className="test-unit-badge">Unit: {selectedTest.unit || 'N/A'}</span>
                </div>

                {/* Patient Demographics Selector (Gender & Age) */}
                <div className="demographics-bar">
                  <div className="demo-field">
                    <label>Patient Gender:</label>
                    <div className="sex-toggle-group">
                      <button 
                        type="button" 
                        className={`sex-btn ${selectedSex === 'female' ? 'active' : ''}`}
                        onClick={() => setSelectedSex('female')}
                      >
                        Female (خاتون)
                      </button>
                      <button 
                        type="button" 
                        className={`sex-btn ${selectedSex === 'male' ? 'active' : ''}`}
                        onClick={() => setSelectedSex('male')}
                      >
                        Male (مرد)
                      </button>
                    </div>
                  </div>

                  <div className="demo-field">
                    <label>Age (Years):</label>
                    <input 
                      type="number" 
                      className="age-input" 
                      value={ageYears} 
                      onChange={(e) => setAgeYears(e.target.value)} 
                    />
                  </div>

                  {selectedSex === 'female' && (
                    <div className="demo-field checkbox-field">
                      <label>
                        <input 
                          type="checkbox" 
                          checked={isPregnant} 
                          onChange={(e) => setIsPregnant(e.target.checked)} 
                        /> Pregnancy Context
                      </label>
                    </div>
                  )}
                </div>

                {/* Value Input Form */}
                <form className="quick-val-form" onSubmit={handleEvaluate}>
                  <label>Enter Patient's Lab Report Value ({selectedTest.unit}):</label>
                  <div className="val-input-group">
                    <input
                      type="number"
                      step="any"
                      placeholder={`e.g. ${selectedTest.ranges?.[0]?.low || '100'}`}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                    />
                    <button type="submit" className="eval-btn">Evaluate Biomarker</button>
                  </div>
                </form>

                {/* Clinical Evaluation Result */}
                {evaluation && (
                  <div className={`eval-result-card ${evaluation.status}`}>
                    {evaluation.isCritical ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
                    <div>
                      <strong>
                        {evaluation.status.toUpperCase()} — {evaluation.val} {evaluation.unit}
                      </strong>
                      <p className="eval-msg">{evaluation.message}</p>
                      {evaluation.gradeNote && (
                        <p className="grade-badge">{evaluation.gradeNote}</p>
                      )}
                    </div>
                  </div>
                )}

                <button 
                  className="ask-digidoc-btn"
                  onClick={() => {
                    const query = `Mera lab test ${selectedTest.names?.[0]} ka result ${inputValue || 'report'} aya hai (Mareez: ${selectedSex}, Umar: ${ageYears} saal). DigiDoc is report ki wazahat farmayein.`;
                    onAskAboutLab(query);
                    onClose();
                  }}
                >
                  Consult DigiDoc with this Lab Parameter
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
