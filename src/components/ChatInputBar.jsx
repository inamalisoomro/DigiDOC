import React, { useState } from 'react';
import { Plus, Mic, MicOff, Send, ShieldCheck } from 'lucide-react';
import './ChatInputBar.css';

export default function ChatInputBar({ 
  onSendMessage, 
  onStartMic, 
  onStopMic, 
  isListening, 
  isLoading,
  onOpenQuickMenu
}) {
  const [inputText, setInputText] = useState('');

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

  return (
    <div className="chat-input-wrapper">
      <form className="chat-input-capsule" onSubmit={handleSubmit}>
        
        {/* Plus Action Button */}
        <button 
          type="button" 
          className="capsule-addon-btn" 
          onClick={onOpenQuickMenu}
          title="Clinical options / Quick symptoms"
        >
          <Plus size={20} />
        </button>

        {/* Text Field */}
        <input
          type="text"
          className="capsule-input-field"
          placeholder={isListening ? "Listening... (Boliye, main sun raha hoon)" : "Type your message..."}
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
            title={isListening ? "Stop Listening" : "Tap to Speak (Urdu / English)"}
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
      </form>

      {/* Medical Disclaimer under chat bar */}
      <div className="medical-disclaimer">
        <ShieldCheck size={14} className="disclaimer-icon" />
        <span>DigiDoc is here to provide general health information and is not a substitute for professional medical advice.</span>
      </div>
    </div>
  );
}
