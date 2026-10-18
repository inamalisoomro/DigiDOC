import React, { useState } from 'react';
import { Key, X, Sparkles, Volume2, Shield } from 'lucide-react';
import './Modals.css';

export default function SettingsModal({ 
  currentApiKey, 
  onSaveApiKey, 
  onClose,
  onTestTag 
}) {
  const [apiKey, setApiKey] = useState(currentApiKey || '');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    onSaveApiKey(apiKey.trim());
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  const testTags = [
    { tag: 'WARM_SMILE', label: 'Warm Smile 😊', sample: 'Assalam-o-Alaikum! Main DigiDoc hoon. Main aapki kya madad kar sakta hoon?' },
    { tag: 'LISTENING_ATTENTIVE', label: 'Listening Attentive 👂', sample: 'Ji boliye, main tawajjoh se sun raha hoon.' },
    { tag: 'THINKING_ANALYZING', label: 'Thinking / Analyzing 🧠', sample: 'Main aapke lab parameters aur alamaat ka jaiza le raha hoon...' },
    { tag: 'SPEAKING_REASSURING', label: 'Speaking Reassuringly 🩺', sample: 'Fikr na karein, yeh aam alamat hain aur proper supportive care se behtari aayegi.' },
    { tag: 'ALERT_URGENT', label: 'Alert Urgent 🚨', sample: 'Khabardaar! Yeh alamaat shadeed hain, baraye meharbani foran Rescue 1122 par call karein.' }
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="modal-title-group">
            <Key className="modal-icon" size={20} />
            <h3>AI Engine & Avatar Settings</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {/* API Key Form */}
          <form onSubmit={handleSave} className="api-key-section">
            <label className="section-label">AI API Key (Groq / Gemini)</label>
            <p className="section-subtitle">
              Enter your Groq API key (starts with <code>gsk_</code>) or Gemini key. If left blank, DigiDoc operates seamlessly on the local offline Pakistani clinical knowledge engine.
            </p>
            <div className="api-input-row">
              <input
                type="password"
                className="api-key-input"
                placeholder="gsk_... or AIzaSy..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button type="submit" className="save-btn">
                Save Key
              </button>
            </div>
            {savedNotice && <p className="success-msg">✓ API Key saved successfully to browser storage!</p>}
          </form>

          {/* Test Avatar Reactions */}
          <div className="test-reactions-section">
            <label className="section-label">
              <Sparkles size={16} /> Test Avatar Micro-Reactions & Lip-Sync
            </label>
            <p className="section-subtitle">
              Click any reaction tag below to test immediate video cross-fading and reactive behavior:
            </p>
            <div className="tag-test-grid">
              {testTags.map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  className="tag-test-btn"
                  onClick={() => onTestTag(item.tag, item.sample)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info & Persona */}
          <div className="info-box">
            <Shield size={16} className="info-icon" />
            <div className="info-text">
              <strong>Pakistani Healthcare Specialist Persona:</strong> Grounded in verified datasets (PMC registered doctors, NICVD, AKUH, PIMS, Rescue 1122, and standard lab biomarkers).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
