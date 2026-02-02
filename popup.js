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
  if (data.speed) {
    speedSlider.value = data.speed;
    speedValue.textContent = data.speed + 'x';
  }
});

// Get global playback state
chrome.runtime.sendMessage({ action: 'getGlobalState' }, (response) => {
  if (response) {
    isPlaying = response.isPlaying;
    isPaused = response.isPaused;
    updateUI();
    if (response.status) {
      setStatus(response.status, isPlaying ? 'playing' : '');
    }
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

// Load voices
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
      voiceSelect.appendChild(option);
    });
    
    // Restore saved voice
    chrome.storage.sync.get(['voiceId'], (data) => {
      if (data.voiceId) voiceSelect.value = data.voiceId;
    });
  } catch (err) {
    console.error('Failed to load voices:', err);
    setStatus('Failed to load voices', 'error');
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
    chrome.runtime.sendMessage({ action: 'pause' });
  } else if (isPaused) {
    chrome.runtime.sendMessage({ action: 'resume' });
  } else {
    setStatus('Starting...', 'playing');
    chrome.runtime.sendMessage({
      action: 'speakPage',
      apiKey,
      voiceId: voiceSelect.value || 'DYkrAHD8iwork3YSUBbs',
      speed: parseFloat(speedSlider.value)
    });
  }
});

// Stop button - stops whatever tab is playing
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stop' });
  isPlaying = false;
  isPaused = false;
  updateUI();
  setStatus('Stopped');
});

// Listen for state changes
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
    playPauseBtn.classList.add('playing');
  } else if (isPaused) {
    playPauseBtn.innerHTML = '<span id="playIcon">▶</span> Resume';
    playPauseBtn.classList.remove('playing');
  } else {
    playPauseBtn.innerHTML = '<span id="playIcon">▶</span> Read Page';
    playPauseBtn.classList.remove('playing');
  }
}

function setStatus(text, className = '') {
  status.textContent = text;
  status.className = 'status ' + className;
}
