import React, { useState, useRef } from 'react';
import { Plus, Mic, MicOff, Send, ShieldCheck, FileText, Upload } from 'lucide-react';
import './ChatInputBar.css';

export default function ChatInputBar({ 
  onSendMessage, 
  onStartMic, 
  onStopMic, 
  isListening, 
  isLoading,
  onOpenQuickMenu,
  onUploadReport
}) {
  const [inputText, setInputText] = useState('');
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        const query = `Lab Report File Uploaded (${file.name}):\n${content.substring(0, 1500)}`;
        onSendMessage(query);
      }
    };

    // If text file or json
    if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.json') || file.name.endsWith('.csv')) {
      reader.readAsText(file);
    } else {
      // For images or pdfs, notify DigiDoc of the report upload
      const reportNotice = `Mareez ne lab report upload ki hai: "${file.name}" (${(file.size / 1024).toFixed(1)} KB). DigiDoc is report ka mutaliqa jaiza le kar rehnumayi karein.`;
      onSendMessage(reportNotice);
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <div className="chat-input-wrapper">
      <form className="chat-input-capsule" onSubmit={handleSubmit}>
        
        {/* Hidden File Input for Lab Report Upload */}
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".txt,.csv,.json,.pdf,image/*" 
          onChange={handleFileUpload}
        />

        {/* Plus Action Button (Quick Clinical Menu / Labs) */}
        <button 
          type="button" 
          className="capsule-addon-btn" 
          onClick={onOpenQuickMenu}
          title="Clinical Biomarkers & Lab Reference Engine"
        >
          <Plus size={20} />
        </button>

        {/* Upload Lab Report Document Button */}
        <button 
          type="button" 
          className="capsule-addon-btn report-upload-btn" 
          onClick={() => fileInputRef.current?.click()}
          title="Upload Lab Report or Prescription Document"
        >
          <FileText size={18} />
        </button>

        {/* Text Field */}
        <input
          type="text"
          className="capsule-input-field"
          placeholder={isListening ? "Listening... (Boliye, main sun raha hoon)" : "Type symptoms, questions, or paste lab values..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />

        {/* Action Button: Send if text entered, else Mic */}
        {inputText.trim().length > 0 ? (
          <button 
            type="submit" 
            className="capsule-submit-btn send-btn"
            disabled={isLoading}
            title="Send Message"
          >
            <Send size={18} />
          </button>
        ) : (
          <button 
            type="button" 
            className={`capsule-submit-btn mic-btn ${isListening ? 'listening-active' : ''}`}
            onClick={isListening ? onStopMic : onStartMic}
            disabled={isLoading}
            title={isListening ? "Stop Listening" : "Tap to Speak (Hands-free Urdu / English)"}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
      </form>

      {/* Medical Disclaimer under chat bar */}
      <div className="medical-disclaimer">
        <ShieldCheck size={14} className="disclaimer-icon" />
        <span>DigiDoc provides personalized health guidance and specialty triage. Always consult a physician for in-person medical care.</span>
      </div>
    </div>
  );
}
