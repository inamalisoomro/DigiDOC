import React, { useRef, useEffect } from 'react';
import { X, User, Bot, Volume2, ShieldAlert } from 'lucide-react';
import './ConversationDrawer.css';

export default function ConversationDrawer({ 
  isOpen, 
  onClose, 
  messages, 
  onReplaySpeech 
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen) return null;

  return (
    <div className="conversation-drawer-backdrop" onClick={onClose}>
      <div className="conversation-drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <Bot size={22} className="bot-icon" />
            <div>
              <h3>Consultation Transcript</h3>
              <p>DigiDoc Clinical Intake & Dialogue History</p>
            </div>
          </div>
          <button className="drawer-close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="drawer-messages-list">
          {messages.length === 0 ? (
            <div className="empty-messages">
              <p>No messages yet. Start speaking or typing to begin your consultation.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} className={`message-bubble-row ${msg.sender}`}>
                <div className="msg-avatar">
                  {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className="msg-bubble-content">
                  <div className="msg-meta">
                    <span className="msg-sender-name">
                      {msg.sender === 'user' ? 'Aap (Patient)' : 'DigiDoc AI Consultant'}
                    </span>
                    {msg.tag && (
                      <span className="msg-tag-badge">[{msg.tag}]</span>
                    )}
                  </div>
                  <div className="msg-body-text">
                    {msg.text}
                  </div>
                  {msg.sender === 'assistant' && (
                    <button 
                      className="replay-speech-btn"
                      onClick={() => onReplaySpeech(msg.cleanText || msg.text)}
                      title="Listen with Avatar Speaking Animation"
                    >
                      <Volume2 size={14} /> Listen
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
