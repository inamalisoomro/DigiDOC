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
            autoGainControl: true,
            channelCount: 1
          }
        });

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioCtx();
        const source = this.audioContext.createMediaStreamSource(this.microphoneStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.4;
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

    this.vadInterval = setInterval(() => {
      if (!this.analyser || !this.isListening) {
        this.currentVolume = 0;
        if (this.onVolumeChange) this.onVolumeChange(0);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;
      this.currentVolume = rms;

      if (this.onVolumeChange) {
        this.onVolumeChange(rms);
      }
    }, 60);
  }

  initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = this.language;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.latestTranscript = '';
        if (this.onListeningChange) this.onListeningChange(true);
      };

      this.recognition.onresult = (event) => {
        // If AI is already speaking or processing, discard any incoming mic audio immediately!
        if (this.isSpeaking || this.isProcessing) return;

        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            final += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        const candidate = (final || interim).trim();
        if (!candidate || candidate.length < 2) return;

        this.latestTranscript = candidate;

        // Emit interim live words to the UI
        if (this.onInterimTranscript) {
          this.onInterimTranscript(candidate);
        }

        // If marked final by Google STT engine, commit immediately!
        if (final) {
          this.commitTranscript(final);
          return;
        }

        // Fast silence cutoff (650ms after user pauses speaking)
        clearTimeout(this.silenceTimer);
        this.silenceTimer = setTimeout(() => {
          if (this.latestTranscript && this.latestTranscript.length >= 2 && !this.isSpeaking && !this.isProcessing) {
            this.commitTranscript(this.latestTranscript);
          }
        }, 650);
      };

      this.recognition.onerror = (event) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition notice:', event.error);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onListeningChange) this.onListeningChange(false);

        // Resume listening ONLY if continuous is on AND AI is NOT speaking and NOT processing
        if (this.isContinuous && !this.isSpeaking && !this.isProcessing && !this.isRestarting) {
          this.restartRecognitionWithDelay(250);
        }
      };
    }
  }

  commitTranscript(text) {
    clearTimeout(this.silenceTimer);
    const cleanText = text.trim();
    this.latestTranscript = '';

    if (cleanText && cleanText.length >= 2) {
      // Mark as processing so onend will NOT restart recognition while AI prepares answer!
      this.isProcessing = true;

      try {
        this.recognition.stop();
      } catch (e) {}

      if (this.onTranscript) {
        this.onTranscript(cleanText);
      }
    }
  }

  restartRecognitionWithDelay(delayMs = 250) {
    if (!this.isContinuous || this.isSpeaking || this.isProcessing || this.isListening) return;

    this.isRestarting = true;
    setTimeout(() => {
      this.isRestarting = false;
      if (this.isContinuous && !this.isSpeaking && !this.isProcessing && !this.isListening && this.recognition) {
        try {
          this.recognition.start();
        } catch (e) {}
      }
    }, delayMs);
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  async startContinuousMode(onTranscript, onInterimTranscript, onInterrupted) {
    this.isContinuous = true;
    this.isProcessing = false;
    this.onTranscript = onTranscript;
    this.onInterimTranscript = onInterimTranscript;
    this.onInterrupted = onInterrupted;
    this.latestTranscript = '';

    await this.initAudioHardware();

    if (this.recognition && !this.isListening && !this.isSpeaking) {
      try {
        this.recognition.start();
      } catch (err) {}
    }
  }

  stopContinuousMode() {
    this.isContinuous = false;
    this.isProcessing = false;
    clearTimeout(this.silenceTimer);
    this.latestTranscript = '';
    this.stopSpeaking();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (err) {}
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
    if (!this.synthesis) {
      this.isProcessing = false;
      if (onStart) onStart();
      setTimeout(() => { if (onEnd) onEnd(); }, 2500);
      return;
    }

    // Cancel any previous speech
    this.synthesis.cancel();

    // Ensure mic recognition is completely stopped
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1.03;

    const voices = this.synthesis.getVoices();
    const urduVoice = voices.find(v => v.lang.includes('ur') || v.lang.includes('hi') || v.name.includes('Urdu') || v.name.includes('Hindi'));
    const englishVoice = voices.find(v => v.lang.includes('en-GB') || v.lang.includes('en-US'));

    if (this.language.startsWith('ur') && urduVoice) {
      utterance.voice = urduVoice;
    } else if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(true);
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (onEnd) onEnd();

      // DigiDoc finished speaking! Wait 350ms for room echo to disperse, then restart listening
      if (this.isContinuous) {
        this.restartRecognitionWithDelay(350);
      }
    };

    utterance.onerror = (e) => {
      console.warn("Speech synthesis notice:", e);
      this.isSpeaking = false;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(false);
      if (onEnd) onEnd();

      if (this.isContinuous) {
        this.restartRecognitionWithDelay(350);
      }
    };

    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
      this.isProcessing = false;
      if (this.onSpeakingChange) this.onSpeakingChange(false);

      if (this.isContinuous) {
        this.restartRecognitionWithDelay(250);
      }
    }
  }
}

export const speechService = new SpeechService();
