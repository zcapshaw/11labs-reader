// State
let isPlaying = false;
let isPaused = false;

// Elements
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
const voiceSelect = document.getElementById('voiceSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const status = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['apiKey', 'voiceId', 'speed'], (data) => {
  if (data.apiKey) {
    apiKeyInput.value = data.apiKey;
    loadVoices(data.apiKey);
  }
  if (data.voiceId) {
    voiceSelect.value = data.voiceId;
  }
  if (data.speed) {
    speedSlider.value = data.speed;
    speedValue.textContent = data.speed + 'x';
  }
});

// Speed slider
speedSlider.addEventListener('input', () => {
  const speed = speedSlider.value;
  speedValue.textContent = speed + 'x';
  chrome.storage.sync.set({ speed });
});

// Save API key
saveKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Please enter an API key', 'error');
    return;
  }
  
  chrome.storage.sync.set({ apiKey });
  setStatus('API key saved!');
  loadVoices(apiKey);
});

// Load voices from ElevenLabs
async function loadVoices(apiKey) {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });
    
    if (!response.ok) throw new Error('Invalid API key');
    
    const data = await response.json();
    voiceSelect.innerHTML = '';
    
    data.voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voice_id;
      option.textContent = voice.name;
      if (voice.voice_id === 'DYkrAHD8iwork3YSUBbs') {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });
    
    // Restore saved voice selection
    chrome.storage.sync.get(['voiceId'], (data) => {
      if (data.voiceId) {
        voiceSelect.value = data.voiceId;
      }
    });
  } catch (err) {
    console.error('Failed to load voices:', err);
    setStatus('Failed to load voices - check API key', 'error');
  }
}

// Voice selection
voiceSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ voiceId: voiceSelect.value });
});

// Play/Pause button
playPauseBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Please enter an API key', 'error');
    return;
  }
  
  if (isPlaying && !isPaused) {
    // Pause
    chrome.runtime.sendMessage({ action: 'pause' });
    isPaused = true;
    updateUI();
  } else if (isPaused) {
    // Resume
    chrome.runtime.sendMessage({ action: 'resume' });
    isPaused = false;
    updateUI();
  } else {
    // Start reading
    setStatus('Starting...', 'playing');
    
    chrome.runtime.sendMessage({
      action: 'speakPage',
      apiKey,
      voiceId: voiceSelect.value || 'DYkrAHD8iwork3YSUBbs',
      speed: parseFloat(speedSlider.value)
    });
    
    isPlaying = true;
    isPaused = false;
    updateUI();
  }
});

// Stop button
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  isPlaying = false;
  isPaused = false;
  updateUI();
  setStatus('Stopped');
});

// Listen for state changes from background/content
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'stateChange') {
    isPlaying = message.isPlaying;
    isPaused = message.isPaused;
    updateUI();
    
    if (message.status) {
      setStatus(message.status, message.isPlaying ? 'playing' : '');
    }
  }
});

function updateUI() {
  if (isPlaying && !isPaused) {
    playPauseBtn.innerHTML = '<span id="playIcon">⏸</span> Pause';
  } else if (isPaused) {
    playPauseBtn.innerHTML = '<span id="playIcon">▶</span> Resume';
  } else {
    playPauseBtn.innerHTML = '<span id="playIcon">▶</span> Read Page';
  }
}

function setStatus(text, className = '') {
  status.textContent = text;
  status.className = 'status ' + className;
}
