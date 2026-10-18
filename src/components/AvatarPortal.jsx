import React, { useRef, useEffect } from 'react';
import './AvatarPortal.css';

export default function AvatarPortal({ 
  avatarState = 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking' | 'alert'
  currentTag = 'WARM_SMILE',
  speechText = "Hi there! I'm listening...",
  isListening = false,
  isSpeaking = false,
  liveVolume = 0
}) {
  const microVideoRef = useRef(null);
  const speakingVideoRef = useRef(null);

  // Synchronize videos based on speaking state
  useEffect(() => {
    const microVid = microVideoRef.current;
    const speakVid = speakingVideoRef.current;

    if (!microVid || !speakVid) return;

    if (avatarState === 'speaking' || isSpeaking) {
      speakVid.currentTime = 0;
      speakVid.play().catch(e => console.warn('Speak video autoplay notice', e));
      speakVid.style.opacity = '1';
      microVid.style.opacity = '0';
    } else {
      microVid.play().catch(e => console.warn('Micro video autoplay notice', e));
      microVid.style.opacity = '1';
      speakVid.style.opacity = '0';
    }
  }, [avatarState, isSpeaking]);

  // Tag to human readable mood/expression
  const getTagDescription = () => {
    switch (currentTag) {
      case 'LISTENING_ATTENTIVE':
        return { label: 'Listening Attentive', color: '#38BDF8' };
      case 'NOD_EMPATHETIC':
        return { label: 'Empathetic Nod', color: '#60A5FA' };
      case 'THINKING_ANALYZING':
        return { label: 'Analyzing Symptoms & Labs', color: '#A78BFA' };
      case 'SPEAKING_REASSURING':
        return { label: 'Speaking Reassuringly', color: '#3B82F6' };
      case 'ALERT_URGENT':
        return { label: 'Critical Alert ⚠️', color: '#EF4444' };
      case 'WARM_SMILE':
      default:
        return { label: 'Kind & Empathetic', color: '#93C5FD' };
    }
  };

  const tagInfo = getTagDescription();

  // Dynamic voice height for the 5 waveform bars
  const v = Math.min(1, Math.max(0, liveVolume * 8));
  const isVoiceActive = liveVolume > 0.03 || isSpeaking || avatarState === 'speaking';

  return (
    <div className={`avatar-portal-wrapper state-${avatarState}`}>
      {/* Central Circular Stage */}
      <div className="portal-container">
        
        {/* Outer Glow Ring & Rotating Energy Border */}
        <div className="glow-backdrop"></div>
        <div className="orbit-ring">
          <div className="orbit-dot"></div>
        </div>
        <div className="pulse-aura"></div>

        {/* Circular Mask for Dual-Buffered Video */}
        <div className="video-viewport">
          {/* Micro-reactions / Idle Video */}
          <video
            ref={microVideoRef}
            src="/assets/videos/micro-reaction.mp4"
            className="avatar-video"
            autoPlay
            loop
            muted
            playsInline
          />

          {/* Speaking Animation Video */}
          <video
            ref={speakingVideoRef}
            src="/assets/videos/speaking-animation.mp4"
            className="avatar-video speaking-video"
            loop
            muted
            playsInline
          />
        </div>

        {/* Floating Speech Bubble (as shown in reference image) */}
        <div className="speech-bubble-container">
          <div className="speech-bubble">
            <div className="speech-bubble-header">
              <span className="bubble-title">
                {avatarState === 'listening' 
                  ? (liveVolume > 0.03 ? "Listening to your voice..." : "I'm listening...") 
                  : avatarState === 'thinking'
                  ? "Analyzing..."
                  : avatarState === 'alert'
                  ? "Urgent Safety Alert"
                  : "Hi there!"}
              </span>
              
              {/* Intelligent Sound Waveform Graphic */}
              <div className={`audio-waveform ${isVoiceActive ? 'active' : ''}`}>
                <span className="bar bar1" style={{ height: isVoiceActive ? `${Math.max(6, 14 * v)}px` : '4px' }}></span>
                <span className="bar bar2" style={{ height: isVoiceActive ? `${Math.max(8, 20 * v)}px` : '5px' }}></span>
                <span className="bar bar3" style={{ height: isVoiceActive ? `${Math.max(10, 24 * v)}px` : '6px' }}></span>
                <span className="bar bar4" style={{ height: isVoiceActive ? `${Math.max(8, 18 * v)}px` : '5px' }}></span>
                <span className="bar bar5" style={{ height: isVoiceActive ? `${Math.max(6, 12 * v)}px` : '4px' }}></span>
              </div>
            </div>

            <p className="bubble-text">
              {avatarState === 'listening' 
                ? "Boliye, main tawajjoh se sun raha hoon (Noise filtered)."
                : speechText || "I'm listening..."}
            </p>
          </div>
          <div className="speech-bubble-arrow"></div>
        </div>
      </div>

      {/* Reactive Expression & Persona Badge */}
      <div className="avatar-meta-bar">
        <div className="expression-pill" style={{ borderColor: tagInfo.color }}>
          <span className="pulse-indicator" style={{ backgroundColor: tagInfo.color }}></span>
          <span className="tag-label" style={{ color: tagInfo.color }}>{tagInfo.label}</span>
        </div>
        <div className="carousel-dots">
          <span className="dot active"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>
    </div>
  );
}
