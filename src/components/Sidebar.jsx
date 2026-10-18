import React from 'react';
import { Home, MessageSquare, ClipboardList, Clock, Settings, User } from 'lucide-react';
import './Sidebar.css';

export default function Sidebar({ activeTab, onTabChange, onOpenSettings }) {
  return (
    <aside className="digidoc-sidebar">
      <div className="sidebar-top">
        <button 
          className={`sidebar-nav-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => onTabChange('home')}
          title="Home Portal"
        >
          <Home size={22} />
        </button>

        <button 
          className={`sidebar-nav-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => onTabChange('chat')}
          title="Consultation History"
        >
          <MessageSquare size={22} />
        </button>

        <button 
          className={`sidebar-nav-btn ${activeTab === 'doctors' ? 'active' : ''}`}
          onClick={() => onTabChange('doctors')}
          title="Verified Doctors Directory"
        >
          <ClipboardList size={22} />
        </button>

        <button 
          className={`sidebar-nav-btn ${activeTab === 'labs' ? 'active' : ''}`}
          onClick={() => onTabChange('labs')}
          title="Lab Report Biomarkers"
        >
          <Clock size={22} />
        </button>
      </div>

      <div className="sidebar-bottom">
        <button 
          className="sidebar-nav-btn settings-btn"
          onClick={onOpenSettings}
          title="AI Studio API Key & Settings"
        >
          <Settings size={22} />
        </button>
      </div>
    </aside>
  );
}
