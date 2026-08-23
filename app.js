document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    text: document.querySelector("#yorubaText"),
    voiceSelect: document.querySelector("#voiceSelect"),
    rate: document.querySelector("#rate"),
    pitch: document.querySelector("#pitch"),
    volume: document.querySelector("#volume"),
    rateOutput: document.querySelector("#rateOutput"),
    pitchOutput: document.querySelector("#pitchOutput"),
    volumeOutput: document.querySelector("#volumeOutput"),
    characterCount: document.querySelector("#characterCount"),
    speakButton: document.querySelector("#speakButton"),
    pauseButton: document.querySelector("#pauseButton"),
    resumeButton: document.querySelector("#resumeButton"),
    stopButton: document.querySelector("#stopButton"),
    clearButton: document.querySelector("#clearButton"),
    statusBox: document.querySelector("#statusBox"),
    statusText: document.querySelector("#statusText"),
    characterButtons: document.querySelectorAll(".character-button")
  };

  const setStatus = (message, state = "ready") => {
    elements.statusText.textContent = message;
    elements.statusBox.dataset.state = state;
  };

  const tts = new window.YorubaTTS({
    language: "yo-NG",
    onStatus: setStatus,
    onVoicesChanged: populateVoiceMenu
  });

  function populateVoiceMenu(voices, preferredVoice) {
    const previousSelection = elements.voiceSelect.value;
    elements.voiceSelect.replaceChildren();

    if (voices.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No voices loaded yet";
      elements.voiceSelect.append(option);
      return;
    }

    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice.voiceURI;

      const isYoruba = tts.isYorubaVoice(voice);
      const tags = [
        isYoruba ? "Yoruba" : null,
        voice.default ? "default" : null,
        voice.localService ? "local" : "online"
      ].filter(Boolean);

      option.textContent =
        `${voice.name} — ${voice.lang}` +
        (tags.length ? ` (${tags.join(", ")})` : "");

      elements.voiceSelect.append(option);
    }

    const stillExists = voices.some(
      (voice) => voice.voiceURI === previousSelection
    );

    if (stillExists) {
      elements.voiceSelect.value = previousSelection;
    } else if (preferredVoice) {
      elements.voiceSelect.value = preferredVoice.voiceURI;
    } else {
      const defaultVoice = voices.find((voice) => voice.default);
      elements.voiceSelect.value = defaultVoice?.voiceURI ?? voices[0].voiceURI;
    }
  }

  function updateRangeOutput(input, output) {
    output.value = Number(input.value).toFixed(1);
  }

  function updateCharacterCount() {
    const count = [...elements.text.value].length;
    elements.characterCount.textContent =
      `${count} character${count === 1 ? "" : "s"}`;
  }

  function insertAtCursor(character) {
    const start = elements.text.selectionStart;
    const end = elements.text.selectionEnd;
    const original = elements.text.value;

    elements.text.setRangeText(character, start, end, "end");
    elements.text.focus();

    if (elements.text.value === original) {
      // Very old browser fallback.
      elements.text.value =
        original.slice(0, start) + character + original.slice(end);
    }

    updateCharacterCount();
  }

  elements.speakButton.addEventListener("click", () => {
    const selectedVoice = tts.getVoiceByURI(elements.voiceSelect.value);

    tts.speak(elements.text.value, {
      voice: selectedVoice,
      rate: elements.rate.value,
      pitch: elements.pitch.value,
      volume: elements.volume.value
    });
  });

  elements.pauseButton.addEventListener("click", () => tts.pause());
  elements.resumeButton.addEventListener("click", () => tts.resume());
  elements.stopButton.addEventListener("click", () => tts.stop());

  elements.clearButton.addEventListener("click", () => {
    tts.stop(false);
    elements.text.value = "";
    elements.text.focus();
    updateCharacterCount();
    setStatus("Text cleared.", "ready");
  });

  elements.text.addEventListener("input", updateCharacterCount);

  elements.rate.addEventListener("input", () => {
    updateRangeOutput(elements.rate, elements.rateOutput);
  });

  elements.pitch.addEventListener("input", () => {
    updateRangeOutput(elements.pitch, elements.pitchOutput);
  });

  elements.volume.addEventListener("input", () => {
    updateRangeOutput(elements.volume, elements.volumeOutput);
  });

  for (const button of elements.characterButtons) {
    button.addEventListener("click", () => {
      insertAtCursor(button.dataset.character);
    });
  }

  // Stop queued speech when the page closes or reloads.
  window.addEventListener("beforeunload", () => tts.stop(false));

  updateRangeOutput(elements.rate, elements.rateOutput);
  updateRangeOutput(elements.pitch, elements.pitchOutput);
  updateRangeOutput(elements.volume, elements.volumeOutput);
  updateCharacterCount();

  if (!tts.isSupported) {
    elements.speakButton.disabled = true;
    elements.pauseButton.disabled = true;
    elements.resumeButton.disabled = true;
    elements.stopButton.disabled = true;
  }

  tts.initialize();
});
