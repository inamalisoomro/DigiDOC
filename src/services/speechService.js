export class SpeechService {
  constructor() {
    this.recognition = null;
    this.synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.audioContext = null;
    this.analyser = null;
    this.microphoneStream = null;
    this.vadInterval = null;

    this.isListening = false;
    this.isSpeaking = false;
    this.isProcessing = false;
    this.isContinuous = false;
    this.language = 'ur-PK'; // default Urdu (Pakistan)

    this.currentVolume = 0;
    this.latestTranscript = '';
    this.silenceTimer = null;
    this.isRestarting = false;
    this.speechStartTime = null;
    this.cachedVoices = [];

    // Preload speech synthesis voices
    if (this.synthesis) {
      this.cachedVoices = this.synthesis.getVoices() || [];
      if (typeof this.synthesis.onvoiceschanged !== 'undefined') {
        this.synthesis.onvoiceschanged = () => {
          this.cachedVoices = this.synthesis.getVoices() || [];
        };
      }
    }

    // Callbacks
    this.onListeningChange = null;
    this.onSpeakingChange = null;
    this.onTranscript = null;
    this.onInterimTranscript = null;
    this.onInterrupted = null;
    this.onVolumeChange = null;

    this.initRecognition();
  }

  // Initialize hardware noise suppression & echo cancellation
  async initAudioHardware() {
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;

      if (!this.microphoneStream) {
        this.microphoneStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false, // Prevents mic from ramping up gain and picking up breathing/air
            channelCount: 1
          }
        });

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.3;
        source.connect(this.analyser);

        this.startVADLoop();
      }
    } catch (err) {
      console.warn("Hardware audio filter notice (fallback to standard):", err);
    }
  }

  startVADLoop() {
    if (this.vadInterval) clearInterval(this.vadInterval);

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    let bargeInFrames = 0; // counts consecutive voice-energy frames during AI speech

    this.vadInterval = setInterval(() => {
      if (!this.analyser) {
        this.currentVolume = 0;
        if (this.onVolumeChange) this.onVolumeChange(0);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      // Frequency bin analysis:
      // fftSize = 256 => 128 frequency bins
      // Bins 0-1 (~0-350Hz): Low-frequency breath pops, wind rumble, desk vibration
      // Bins 2-18 (~350-3400Hz): Core human voice fundamental & formants
      let lowSum = 0;
      let voiceSum = 0;
      let totalSum = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i];
        totalSum += val * val;
        if (i <= 1) {
          lowSum += val * val;
        } else if (i >= 2 && i <= 18) {
          voiceSum += val * val;
        }
      }

      const totalRms = Math.sqrt(totalSum / dataArray.length) / 255;
      const voiceRms = Math.sqrt(voiceSum / 17) / 255;
      const lowRms = Math.sqrt(lowSum / 2) / 255;

      this.currentVolume = voiceRms > 0.04 ? voiceRms : (totalRms * 0.7);

      // Report volume to UI only when actively listening
      if (this.isListening && this.onVolumeChange) {
        this.onVolumeChange(this.currentVolume);
      }

      // BARGE-IN: detect deliberate user speech while AI is talking
      // 1. Must be actively speaking and continuous mode enabled
      // 2. 400ms grace period after AI speech begins (suppresses speaker click, but allows quick interruption)
      // 3. Human voice energy (voiceRms > 0.15) distinct from low-frequency breath
      // 4. Requires only 3 consecutive frames (~180ms) for responsive interruption
      const isPastGracePeriod = this.speechStartTime && (Date.now() - this.speechStartTime > 400);
      const isVoiceEnergy = voiceRms > 0.15 && (voiceRms > lowRms * 0.55 || lowRms < 0.4);

      if (this.isSpeaking && this.isContinuous && isPastGracePeriod && isVoiceEnergy) {
        bargeInFrames++;
        if (bargeInFrames >= 3) {
          bargeInFrames = 0;
          this.stopSpeaking();                            // stops AI, resets state, restarts mic
          if (this.onInterrupted) this.onInterrupted();  // updates avatar to listening
        }
      } else {
        bargeInFrames = 0;
      }
    }, 60);
  }

  initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true; // Stays active continuously
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.language;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.latestTranscript = '';
        this.accumulatedTranscript = '';
        if (this.onListeningChange) this.onListeningChange(true);
      };

      this.recognition.onresult = (event) => {
        // Interruption: if AI is speaking and user speaks, stop AI immediately!
        if (this.isSpeaking) {
          this.stopSpeaking();
          if (this.onInterrupted) this.onInterrupted();
          return;
        }

        if (this.isProcessing) return;

        let currentInterim = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            this.accumulatedTranscript = (this.accumulatedTranscript + ' ' + res[0].transcript).trim();
          } else {
            currentInterim = (currentInterim + ' ' + res[0].transcript).trim();
          }
        }

        const fullSpoken = (this.accumulatedTranscript + ' ' + currentInterim).trim();
        if (!fullSpoken || fullSpoken.length < 2) return;

        this.latestTranscript = fullSpoken;

        // Emit interim live words to the UI
        if (this.onInterimTranscript) {
          this.onInterimTranscript(fullSpoken);
        }

        // Natural calm pause cutoff (800ms after user finishes full sentence)
        // This gives the user time to speak their complete thought without getting cut off on the first word!
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (this.latestTranscript && this.latestTranscript.length >= 2 && !this.isSpeaking && !this.isProcessing) {
            this.commitTranscript(this.latestTranscript);
          }
        }, 800);
      };

      this.recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition notice:', event.error);
        }
        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          this.isListening = false;
          if (this.onListeningChange) this.onListeningChange(false);
        }
        // Network error: Google STT servers unreachable — auto-retry after 1s
        if (event.error === 'network') {
          this.isListening = false;
          if (this.onListeningChange) this.onListeningChange(false);
          if (this.isContinuous && !this.isSpeaking && !this.isProcessing) {
            this.restartRecognitionWithDelay(1000);
          }
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onListeningChange) this.onListeningChange(false);

        // Resume listening immediately if continuous is on AND AI is NOT speaking and NOT processing
        if (this.isContinuous && !this.isSpeaking && !this.isProcessing && !this.isRestarting) {
          this.restartRecognitionWithDelay(30);
        }
      };
    }
  }

  startRecognition() {
    if (!this.recognition) {
      this.initRecognition();
    }
    if (!this.recognition || this.isSpeaking || this.isProcessing) return;

    try {
      this.recognition.lang = this.language;
      this.recognition.start();
    } catch {
      // If recognition was in an invalid state, re-create fresh instance
      this.initRecognition();
      try {
        if (this.recognition) {
          this.recognition.lang = this.language;
          this.recognition.start();
        }
      } catch (err) {
        console.warn("Speech recognition restart notice:", err);
      }
    }
  }

  commitTranscript(text) {
    clearTimeout(this.silenceTimer);
    const cleanText = text.trim();
    this.latestTranscript = '';
    this.accumulatedTranscript = '';

    if (cleanText && cleanText.length >= 2) {
      // Mark as processing so onend will NOT restart recognition while AI prepares answer!
      this.isProcessing = true;

      // Auto-unlock watchdog: If AI doesn't reply within 12 seconds, reset isProcessing
      clearTimeout(this.processingWatchdog);
      this.processingWatchdog = setTimeout(() => {
        if (this.isProcessing && !this.isSpeaking) {
          console.warn("Speech processing watchdog triggered: resetting state");
          this.isProcessing = false;
          if (this.isContinuous) {
            this.restartRecognitionWithDelay(250);
          }
        }
      }, 12000);

      try {
        this.recognition.stop();
      } catch {}

      if (this.onTranscript) {
        this.onTranscript(cleanText);
      }
    }
  }

  restartRecognitionWithDelay(delayMs = 250) {
    if (!this.isContinuous || this.isSpeaking || this.isProcessing) return;

    this.isRestarting = true;
    setTimeout(() => {
      this.isRestarting = false;
      if (this.isContinuous && !this.isSpeaking && !this.isProcessing && !this.isListening) {
        this.startRecognition();
      }
    }, delayMs);
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
      // If currently listening, restart recognition to apply new language immediately
      if (this.isListening) {
        try {
          this.recognition.stop();
        } catch {}
      }
    }
  }

  startContinuousMode(onTranscript, onInterimTranscript, onInterrupted) {
    this.isContinuous = true;
    this.isProcessing = false;
    this.onTranscript = onTranscript;
    this.onInterimTranscript = onInterimTranscript;
    this.onInterrupted = onInterrupted;
    this.latestTranscript = '';

    // 1. Start speech recognition immediately
    this.startRecognition();

    // 2. Initialize optional hardware audio visualizer in background (does NOT block speech recognition)
    this.initAudioHardware().catch(() => {});
  }

  stopContinuousMode() {
    this.isContinuous = false;
    this.isProcessing = false;
    clearTimeout(this.silenceTimer);
    clearTimeout(this.processingWatchdog);
    this.latestTranscript = '';
    this.stopSpeaking();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }

    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(t => t.stop());
      this.microphoneStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  speak(text, onStart, onEnd) {
    clearTimeout(this.processingWatchdog);

    if (!text || !text.trim()) {
      this.isProcessing = false;
      this.isSpeaking = false;
      this.speechStartTime = null;
      if (onEnd) onEnd();
      if (this.isContinuous) this.restartRecognitionWithDelay(200);
      return;
    }

    if (!this.synthesis) {
      this.isProcessing = false;
      this.speechStartTime = null;
      if (onStart) onStart();
      setTimeout(() => { 
        if (onEnd) onEnd(); 
        if (this.isContinuous) this.restartRecognitionWithDelay(200);
      }, 2500);
      return;
    }

    // Cancel any previous speech
    this.synthesis.cancel();

    // Ensure mic recognition is completely stopped
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1.03;

    const voices = (this.cachedVoices && this.cachedVoices.length > 0)
      ? this.cachedVoices
      : (this.synthesis.getVoices() || []);

    const urduVoice = voices.find(v => {
      const l = (v.lang || '').toLowerCase();
      const n = (v.name || '').toLowerCase();
      return l.includes('ur') || l.includes('hi') || n.includes('urdu') || n.includes('hindi');
    });
    const englishVoice = voices.find(v => {
      const l = (v.lang || '').toLowerCase();
      return l.includes('en-gb') || l.includes('en-us') || l.includes('en');
    });

    if (this.language.startsWith('ur')) {
      if (urduVoice) {
        utterance.voice = urduVoice;
        utterance.lang = urduVoice.lang || 'ur-PK';
      } else {
        utterance.lang = 'ur-PK';
        if (englishVoice) {
          utterance.voice = englishVoice;
        }
      }
    } else {
      if (englishVoice) {
        utterance.voice = englishVoice;
        utterance.lang = englishVoice.lang || 'en-US';
      }
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.speechStartTime = Date.now();
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(true);
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.speechStartTime = null;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (onEnd) onEnd();

      // DigiDoc finished speaking! Instantly restart listening so no user words are missed
      if (this.isContinuous) {
        this.restartRecognitionWithDelay(40);
      }
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis notice:", e);
      this.isSpeaking = false;
      this.speechStartTime = null;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (onEnd) onEnd();

      if (this.isContinuous) {
        this.restartRecognitionWithDelay(40);
      }
    };

    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.isProcessing = false;
    this.latestTranscript = '';
    this.accumulatedTranscript = '';
    if (this.onSpeakingChange) this.onSpeakingChange(false);

    if (this.isContinuous) {
      this.restartRecognitionWithDelay(30);
    }
  }
}

export const speechService = new SpeechService();
