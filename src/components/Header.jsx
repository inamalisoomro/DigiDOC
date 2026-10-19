import React from 'react';
import { Globe, Key } from 'lucide-react';
import digidocLogo from '../assets/digidoc-logo.jpg';
import './Header.css';

export default function Header({ hasApiKey, language, onToggleLanguage, onOpenSettings }) {
  return (
    <header className="digidoc-header">
      {/* Brand logo & tagline */}
      <div className="brand-box">
        <div className="logo-badge">
          <img src={digidocLogo} alt="DigiDoc Logo" className="brand-logo-img" />
        </div>
        <div className="brand-text">
          <h1 className="brand-title">Digi<span>Doc</span></h1>
          <p className="brand-tagline">Your Health. My Priority.</p>
        </div>
      </div>

      {/* Right controls */}
      <div className="header-actions">
        {/* Language switch */}
        <button 
          className="lang-pill" 
          onClick={onToggleLanguage}
          title="Toggle Urdu / Roman Urdu / English"
        >
          <Globe size={15} />
          <span>{language === 'ur-PK' ? 'اردو (Urdu)' : 'English'}</span>
        </button>

        {/* API Key status button */}
        <button 
          className={`api-key-badge ${hasApiKey ? 'connected' : 'offline'}`}
          onClick={onOpenSettings}
          title={hasApiKey ? 'AI Engine Connected (Groq / Gemini)' : 'Offline / Click to connect API'}
        >
          <Key size={14} />
          <span>{hasApiKey ? 'AI Connected' : 'Setup API'}</span>
        </button>

        {/* Online Status Pill */}
        <div className="status-pill">
          <span className="status-dot"></span>
          <span className="status-text">Online</span>
        </div>
      </div>
    </header>
  );
}
