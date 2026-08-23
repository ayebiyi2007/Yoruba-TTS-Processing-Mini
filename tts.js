/**
 * YorubaTTS
 * A small wrapper around the browser Web Speech API.
 *
 * Important:
 * This does not contain a trained Yoruba speech model. It uses voices made
 * available by the user's browser or operating system.
 */
class YorubaTTS {
  constructor({
    language = "yo-NG",
    onStatus = () => {},
    onVoicesChanged = () => {}
  } = {}) {
    this.language = language;
    this.onStatus = onStatus;
    this.onVoicesChanged = onVoicesChanged;

    this.synth = window.speechSynthesis;
    this.voices = [];
    this.queue = [];
    this.queueIndex = 0;
    this.currentUtterance = null;
    this.stoppedManually = false;

    this.isSupported =
      "speechSynthesis" in window &&
      "SpeechSynthesisUtterance" in window;
  }

  initialize() {
    if (!this.isSupported) {
      this.onStatus(
        "This browser does not support speech synthesis.",
        "error"
      );
      return;
    }

    this.refreshVoices();

    // Some browsers load their voice list asynchronously.
    if ("onvoiceschanged" in this.synth) {
      this.synth.addEventListener("voiceschanged", () => {
        this.refreshVoices();
      });
    }

    // A second attempt helps browsers that return an empty list at first.
    window.setTimeout(() => this.refreshVoices(), 300);
    window.setTimeout(() => this.refreshVoices(), 1000);
  }

  refreshVoices() {
    if (!this.isSupported) {
      return;
    }

    this.voices = this.synth.getVoices();
    this.onVoicesChanged(this.getSortedVoices(), this.getBestYorubaVoice());

    if (this.voices.length === 0) {
      this.onStatus("Waiting for the browser's voice list...", "warning");
      return;
    }

    if (this.getBestYorubaVoice()) {
      this.onStatus("A Yoruba voice is available.", "ready");
    } else {
      this.onStatus(
        "No Yoruba voice was found. You may still test another installed voice.",
        "warning"
      );
    }
  }

  getSortedVoices() {
    return [...this.voices].sort((a, b) => {
      const aYoruba = this.isYorubaVoice(a);
      const bYoruba = this.isYorubaVoice(b);

      if (aYoruba !== bYoruba) {
        return aYoruba ? -1 : 1;
      }

      return `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`);
    });
  }

  isYorubaVoice(voice) {
    const language = voice?.lang?.toLowerCase() ?? "";
    return language === "yo" || language.startsWith("yo-");
  }

  getBestYorubaVoice() {
    const exactMatch = this.voices.find(
      (voice) => voice.lang.toLowerCase() === this.language.toLowerCase()
    );

    return exactMatch ?? this.voices.find((voice) => this.isYorubaVoice(voice)) ?? null;
  }

  getVoiceByURI(voiceURI) {
    return this.voices.find((voice) => voice.voiceURI === voiceURI) ?? null;
  }

  /**
   * Splits longer input into smaller utterances.
   * This avoids premature stopping in some browser implementations.
   */
  splitIntoChunks(text, maximumLength = 220) {
    const cleaned = text.replace(/\s+/g, " ").trim();

    if (!cleaned) {
      return [];
    }

    const sentences =
      cleaned.match(/[^.!?;\n]+[.!?;]?/g)?.map((part) => part.trim()) ??
      [cleaned];

    const chunks = [];
    let current = "";

    for (const sentence of sentences) {
      if (sentence.length <= maximumLength) {
        const candidate = current ? `${current} ${sentence}` : sentence;

        if (candidate.length <= maximumLength) {
          current = candidate;
        } else {
          if (current) {
            chunks.push(current);
          }
          current = sentence;
        }

        continue;
      }

      if (current) {
        chunks.push(current);
        current = "";
      }

      const words = sentence.split(" ");
      let wordChunk = "";

      for (const word of words) {
        const candidate = wordChunk ? `${wordChunk} ${word}` : word;

        if (candidate.length <= maximumLength) {
          wordChunk = candidate;
        } else {
          if (wordChunk) {
            chunks.push(wordChunk);
          }
          wordChunk = word;
        }
      }

      if (wordChunk) {
        current = wordChunk;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  speak(text, options = {}) {
    if (!this.isSupported) {
      this.onStatus(
        "Speech synthesis is unavailable in this browser.",
        "error"
      );
      return false;
    }

    const chunks = this.splitIntoChunks(text);

    if (chunks.length === 0) {
      this.onStatus("Enter some Yoruba text first.", "warning");
      return false;
    }

    this.stop(false);
    this.stoppedManually = false;
    this.queue = chunks;
    this.queueIndex = 0;
    this.options = {
      voice: options.voice ?? this.getBestYorubaVoice(),
      rate: this.clamp(options.rate ?? 1, 0.1, 10),
      pitch: this.clamp(options.pitch ?? 1, 0, 2),
      volume: this.clamp(options.volume ?? 1, 0, 1)
    };

    this.speakNextChunk();
    return true;
  }

  speakNextChunk() {
    if (this.stoppedManually || this.queueIndex >= this.queue.length) {
      if (!this.stoppedManually) {
        this.onStatus("Finished speaking.", "ready");
      }
      this.currentUtterance = null;
      return;
    }

    const text = this.queue[this.queueIndex];
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.lang = this.language;
    utterance.rate = this.options.rate;
    utterance.pitch = this.options.pitch;
    utterance.volume = this.options.volume;

    if (this.options.voice) {
      utterance.voice = this.options.voice;
      utterance.lang = this.options.voice.lang || this.language;
    }

    utterance.addEventListener("start", () => {
      const part = this.queue.length > 1
        ? ` Part ${this.queueIndex + 1} of ${this.queue.length}.`
        : "";

      this.onStatus(`Speaking.${part}`, "speaking");
    });

    utterance.addEventListener("end", () => {
      if (this.stoppedManually) {
        return;
      }

      this.queueIndex += 1;
      this.speakNextChunk();
    });

    utterance.addEventListener("error", (event) => {
      // "canceled" and "interrupted" commonly occur after pressing Stop
      // or starting a new utterance, so do not present those as failures.
      if (
        this.stoppedManually ||
        event.error === "canceled" ||
        event.error === "interrupted"
      ) {
        return;
      }

      this.onStatus(`Speech error: ${event.error}.`, "error");
    });

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  pause() {
    if (!this.isSupported || !this.synth.speaking) {
      this.onStatus("There is no active speech to pause.", "warning");
      return;
    }

    if (!this.synth.paused) {
      this.synth.pause();
      this.onStatus("Speech paused.", "paused");
    }
  }

  resume() {
    if (!this.isSupported || !this.synth.paused) {
      this.onStatus("There is no paused speech to resume.", "warning");
      return;
    }

    this.synth.resume();
    this.onStatus("Speech resumed.", "speaking");
  }

  stop(showStatus = true) {
    if (!this.isSupported) {
      return;
    }

    this.stoppedManually = true;
    this.queue = [];
    this.queueIndex = 0;
    this.currentUtterance = null;
    this.synth.cancel();

    if (showStatus) {
      this.onStatus("Speech stopped.", "ready");
    }
  }

  clamp(value, minimum, maximum) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return minimum;
    }

    return Math.min(Math.max(number, minimum), maximum);
  }
}

window.YorubaTTS = YorubaTTS;
