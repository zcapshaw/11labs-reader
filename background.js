// Audio playback state
let audioContext = null;
let audioQueue = [];
let currentSource = null;
let isPlaying = false;
let isPaused = false;
let currentSpeed = 1.0;
let pausePosition = 0;

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'readSelection',
    title: 'Read with ElevenLabs',
    contexts: ['selection']
  });
});

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'readSelection' && info.selectionText) {
    const { apiKey, voiceId, speed } = await chrome.storage.sync.get(['apiKey', 'voiceId', 'speed']);
    
    if (!apiKey) {
      console.error('No API key configured');
      return;
    }
    
    speakText(info.selectionText, apiKey, voiceId || 'DYkrAHD8iwork3YSUBbs', speed || 1.0);
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'speak':
      speakText(message.text, message.apiKey, message.voiceId, message.speed);
      break;
      
    case 'pause':
      pauseAudio();
      break;
      
    case 'resume':
      resumeAudio();
      break;
      
    case 'stop':
      stopAudio();
      break;
      
    case 'setSpeed':
      currentSpeed = message.speed;
      if (currentSource) {
        currentSource.playbackRate.value = currentSpeed;
      }
      break;
      
    case 'getState':
      sendResponse({ isPlaying, isPaused });
      break;
  }
  return true;
});

// Split text into chunks
function chunkText(text, maxLength = 4000) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxLength) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

// Main speak function
async function speakText(text, apiKey, voiceId, speed) {
  stopAudio();
  
  const chunks = chunkText(text);
  audioQueue = chunks;
  currentSpeed = speed;
  isPlaying = true;
  isPaused = false;
  
  broadcastState('Reading...', true, false);
  
  await processQueue(apiKey, voiceId);
}

// Process audio queue
async function processQueue(apiKey, voiceId) {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  
  while (audioQueue.length > 0 && isPlaying) {
    if (isPaused) {
      await new Promise(resolve => {
        const checkPause = setInterval(() => {
          if (!isPaused || !isPlaying) {
            clearInterval(checkPause);
            resolve();
          }
        }, 100);
      });
      if (!isPlaying) break;
    }
    
    const chunk = audioQueue.shift();
    
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: chunk,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      await playAudioBuffer(audioBuffer);
      
    } catch (err) {
      console.error('TTS error:', err);
      broadcastState('Error: ' + err.message, false, false);
      stopAudio();
      return;
    }
  }
  
  if (audioQueue.length === 0 && isPlaying) {
    isPlaying = false;
    isPaused = false;
    broadcastState('Finished', false, false);
  }
}

// Play a single audio buffer
function playAudioBuffer(audioBuffer) {
  return new Promise((resolve) => {
    currentSource = audioContext.createBufferSource();
    currentSource.buffer = audioBuffer;
    currentSource.playbackRate.value = currentSpeed;
    currentSource.connect(audioContext.destination);
    
    currentSource.onended = () => {
      currentSource = null;
      resolve();
    };
    
    currentSource.start(0);
  });
}

// Pause audio
function pauseAudio() {
  if (audioContext && isPlaying) {
    audioContext.suspend();
    isPaused = true;
    broadcastState('Paused', true, true);
  }
}

// Resume audio
function resumeAudio() {
  if (audioContext && isPaused) {
    audioContext.resume();
    isPaused = false;
    broadcastState('Reading...', true, false);
  }
}

// Stop audio
function stopAudio() {
  if (currentSource) {
    currentSource.stop();
    currentSource = null;
  }
  audioQueue = [];
  isPlaying = false;
  isPaused = false;
  
  if (audioContext) {
    audioContext.resume(); // Ensure context is not suspended
  }
}

// Broadcast state to popup
function broadcastState(status, playing, paused) {
  chrome.runtime.sendMessage({
    action: 'stateChange',
    status,
    isPlaying: playing,
    isPaused: paused
  }).catch(() => {}); // Ignore if popup is closed
}
