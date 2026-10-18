import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import AvatarPortal from './components/AvatarPortal';
import QuickActions from './components/QuickActions';
import ChatInputBar from './components/ChatInputBar';
import EmergencyBanner from './components/EmergencyBanner';
import SettingsModal from './components/SettingsModal';
import DoctorsModal from './components/DoctorsModal';
import LabAnalyzerModal from './components/LabAnalyzerModal';
import ConversationDrawer from './components/ConversationDrawer';

import { geminiService } from './services/geminiService';
import { speechService } from './services/speechService';
import './App.css';

function App() {
  // Navigation & Modals
  const [activeTab, setActiveTab] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [showDoctors, setShowDoctors] = useState(false);
  const [showLabs, setShowLabs] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Avatar & Voice States
  const [avatarState, setAvatarState] = useState('idle'); // idle | listening | thinking | speaking | alert
  const [currentTag, setCurrentTag] = useState('WARM_SMILE');
  const [speechBubbleText, setSpeechBubbleText] = useState("Hi there! I'm listening...");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isContinuousVoice, setIsContinuousVoice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isEmergency, setIsEmergency] = useState(false);
  const [language, setLanguage] = useState('ur-PK');
  const [liveVolume, setLiveVolume] = useState(0);
  const [liveHearingText, setLiveHearingText] = useState('');

  // Messages History
  const [messages, setMessages] = useState([
    {
      sender: 'assistant',
      text: "[WARM_SMILE] Assalam-o-Alaikum! Main DigiDoc hoon, Quetta aur Balochistan ka digital healthcare consultant. [LISTENING_ATTENTIVE] Main aapki sehat ke hawalay se kya madad kar sakta hoon? Aap ba-asaani bol kar ya likh kar apni takleef batayein.",
      cleanText: "Assalam-o-Alaikum! Main DigiDoc hoon, Quetta aur Balochistan ka digital healthcare consultant. Main aapki sehat ke hawalay se kya madad kar sakta hoon? Aap ba-asaani bol kar ya likh kar apni takleef batayein.",
      tag: "WARM_SMILE"
    }
  ]);

  // Sync speech service listeners
  useEffect(() => {
    speechService.onVolumeChange = (vol) => {
      setLiveVolume(vol);
    };

    speechService.onListeningChange = (listening) => {
      setIsListening(listening);
      if (listening && !speechService.isSpeaking) {
        setAvatarState('listening');
        setCurrentTag('LISTENING_ATTENTIVE');
      }
    };

    speechService.onSpeakingChange = (speaking) => {
      setIsSpeaking(speaking);
      if (speaking) {
        setAvatarState('speaking');
      } else {
        // When speech ends, return to listening if hands-free is active, else alert or idle
        if (speechService.isContinuous) {
          setAvatarState('listening');
          setCurrentTag('LISTENING_ATTENTIVE');
          setSpeechBubbleText("I'm listening... (Main sun raha hoon)");
        } else {
          setAvatarState(isEmergency ? 'alert' : 'idle');
        }
      }
    };
  }, [isEmergency]);

  // Handle Tab changes
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'chat') setShowTranscript(true);
    if (tab === 'doctors') setShowDoctors(true);
    if (tab === 'labs') setShowLabs(true);
  };

  // Toggle Language
  const handleToggleLanguage = () => {
    const nextLang = language === 'ur-PK' ? 'en-US' : 'ur-PK';
    setLanguage(nextLang);
    speechService.setLanguage(nextLang);
  };

  // Vocalize and drive avatar with continuous listening after completion
  const triggerAvatarSpeech = useCallback((text, tag = 'SPEAKING_REASSURING') => {
    setCurrentTag(tag);
    setSpeechBubbleText(text);
    setAvatarState('speaking');

    speechService.speak(
      text,
      () => {
        setIsSpeaking(true);
        setAvatarState('speaking');
      },
      () => {
        setIsSpeaking(false);
        if (speechService.isContinuous) {
          setAvatarState('listening');
          setCurrentTag('LISTENING_ATTENTIVE');
          setSpeechBubbleText("I'm listening... (Main sun raha hoon)");
        } else {
          setAvatarState(tag === 'ALERT_URGENT' ? 'alert' : 'idle');
        }
      }
    );
  }, []);

  // Send message to DigiDoc
  const handleSendMessage = useCallback(async (userText) => {
    if (!userText || !userText.trim()) return;

    // Add user message
    setMessages(prev => [
      ...prev,
      { sender: 'user', text: userText }
    ]);

    // Update avatar to thinking
    setIsLoading(true);
    setAvatarState('thinking');
    setCurrentTag('THINKING_ANALYZING');
    setSpeechBubbleText("Analyzing your concern...");

    try {
      const response = await geminiService.sendMessage(userText);

      setIsLoading(false);

      if (response.isUrgent) {
        setIsEmergency(true);
        setAvatarState('alert');
      }

      setCurrentTag(response.primaryTag);

      // Save to messages
      setMessages(prev => [
        ...prev,
        {
          sender: 'assistant',
          text: response.rawText,
          cleanText: response.cleanSpeechText,
          tag: response.primaryTag
        }
      ]);

      // Vocalize and animate avatar
      triggerAvatarSpeech(response.cleanSpeechText, response.primaryTag);

    } catch (err) {
      console.error(err);
      setIsLoading(false);
      setAvatarState('idle');
      setSpeechBubbleText("Maaf kijiye ga, dobara koshish karein.");
    }
  }, [triggerAvatarSpeech]);

  // Toggle Continuous Hands-Free Voice Mode
  const handleToggleContinuousVoice = () => {
    if (isContinuousVoice) {
      // Turn OFF voice mode
      speechService.stopContinuousMode();
      setIsContinuousVoice(false);
      setIsListening(false);
      setAvatarState('idle');
      setSpeechBubbleText("Voice conversation paused. Tap mic to talk.");
    } else {
      // Turn ON Continuous Voice Mode
      setIsContinuousVoice(true);
      setAvatarState('listening');
      setCurrentTag('LISTENING_ATTENTIVE');
      setSpeechBubbleText("I'm listening... Boliye, main sun raha hoon.");

      speechService.startContinuousMode(
        // On User Utterance Completed
        (transcript) => {
          setLiveHearingText('');
          if (transcript) {
            handleSendMessage(transcript);
          }
        },
        // On Interim Words Heard Live
        (interim) => {
          setLiveHearingText(interim);
        },
        // On User Interruption / Barge-In while AI is speaking!
        () => {
          setLiveHearingText('');
          setAvatarState('listening');
          setCurrentTag('LISTENING_ATTENTIVE');
          setSpeechBubbleText("Listening to you... (Ji boliye)");
        }
      );
    }
  };

  // Quick action clicked
  const handleQuickAction = (prompt) => {
    handleSendMessage(prompt);
  };

  // Test direct tag
  const handleTestTag = (tag, sampleText) => {
    if (tag === 'ALERT_URGENT') setIsEmergency(true);
    triggerAvatarSpeech(sampleText, tag);
  };

  return (
    <div className="digidoc-app-layout">
      {/* Left Sidebar */}
      <Sidebar 
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main Experience Screen */}
      <div className="main-viewport">
        {/* Header */}
        <Header 
          hasApiKey={Boolean(geminiService.getApiKey())}
          language={language}
          onToggleLanguage={handleToggleLanguage}
          onOpenSettings={() => setShowSettings(true)}
        />

        {/* Emergency Alert Banner */}
        {isEmergency && (
          <EmergencyBanner onDismiss={() => setIsEmergency(false)} />
        )}

        {/* Hands-free Voice Notification Pill */}
        {isContinuousVoice && (
          <div className="hands-free-status-banner">
            <span className="live-mic-dot"></span>
            <span>Hands-Free Continuous Voice Active — Speak naturally at any time or interrupt DigiDoc</span>
            <button className="stop-voice-btn" onClick={handleToggleContinuousVoice}>Stop Voice</button>
          </div>
        )}

        {/* Central Reactive Avatar Stage */}
        <main className="central-stage">
          <AvatarPortal 
            avatarState={avatarState}
            currentTag={currentTag}
            speechText={speechBubbleText}
            isListening={isListening || isContinuousVoice}
            isSpeaking={isSpeaking}
            liveVolume={liveVolume}
          />
        </main>

        {/* Quick Action Navigation Pills */}
        <QuickActions onSelectAction={handleQuickAction} />

        {/* Live Speech Recognition Transcript Indicator */}
        {liveHearingText && (
          <div className="live-hearing-bubble">
            <span className="live-hearing-dot"></span>
            <span className="live-hearing-text">Hearing: "{liveHearingText}"</span>
          </div>
        )}

        {/* Bottom Chat Bar with Continuous Mic & Addons */}
        <ChatInputBar 
          onSendMessage={handleSendMessage}
          onStartMic={handleToggleContinuousVoice}
          onStopMic={handleToggleContinuousVoice}
          isListening={isContinuousVoice || isListening}
          isLoading={isLoading}
          onOpenQuickMenu={() => setShowLabs(true)}
        />
      </div>

      {/* Modals & Drawers */}
      {showSettings && (
        <SettingsModal 
          currentApiKey={geminiService.getApiKey()}
          onSaveApiKey={(key) => geminiService.setApiKey(key)}
          onClose={() => setShowSettings(false)}
          onTestTag={handleTestTag}
        />
      )}

      {showDoctors && (
        <DoctorsModal 
          onClose={() => setShowDoctors(false)}
          onSelectDoctor={(doc) => {
            handleSendMessage(`Main Dr. ${doc.name} (${doc.primarySpecialty} - ${doc.hospitalOrClinic}) se rabta ya consultation ke hawalay se pochna chahta hoon.`);
            setShowDoctors(false);
          }}
        />
      )}

      {showLabs && (
        <LabAnalyzerModal 
          onClose={() => setShowLabs(false)}
          onAskAboutLab={(query) => {
            handleSendMessage(query);
            setShowLabs(false);
          }}
        />
      )}
 
 
      <ConversationDrawer 
        isOpen={showTranscript}
        onClose={() => setShowTranscript(false)}
        messages={messages}
        onReplaySpeech={(text) => triggerAvatarSpeech(text)}
      />
    </div>
  );
}

export default App;
