import React from 'react';
import { Stethoscope, Pill, Heart, MessageCircle } from 'lucide-react';
import './QuickActions.css';

export default function QuickActions({ onSelectAction }) {
  const actions = [
    {
      id: 'advice',
      label: 'Health Advice',
      prompt: 'Mujhe kuch alamaat ke baray mein mashwara chahiye (I need general health advice)',
      icon: Stethoscope
    },
    {
      id: 'medicine',
      label: 'Medicine Info',
      prompt: 'Mujhe dawai aur home care ke mutaliq jankari chahiye (Information regarding supportive care)',
      icon: Pill
    },
    {
      id: 'wellness',
      label: 'Wellness Tips',
      prompt: 'Sehatmand zindagi aur sugar/BP control ke liye rozmarrah ke tips batayein',
      icon: Heart
    },
    {
      id: 'chat',
      label: 'Just Chat',
      prompt: 'Assalam-o-Alaikum DigiDoc! Kese hain aap?',
      icon: MessageCircle
    }
  ];

  return (
    <div className="quick-actions-bar">
      {actions.map((act) => {
        const Icon = act.icon;
        return (
          <button
            key={act.id}
            className="action-pill-btn"
            onClick={() => onSelectAction(act.prompt)}
          >
            <Icon size={17} className="pill-icon" />
            <span>{act.label}</span>
          </button>
        );
      })}
    </div>
  );
}
