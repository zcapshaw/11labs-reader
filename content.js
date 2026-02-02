// Audio playback state
let audioElement = null;
let audioQueue = [];
let isPlaying = false;
let isPaused = false;
let currentApiKey = '';
let currentVoiceId = '';
let currentSpeed = 1.0;

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'ping':
      sendResponse({ ok: true });
      return false;
      
    case 'getContent':
      sendResponse({ text: extractContent() });
      return false;
      
    case 'speakPage':
      speakText(extractContent(), message.apiKey, message.voiceId, message.speed);
      return false;
      
    case 'speak':
      speakText(message.text, message.apiKey, message.voiceId, message.speed);
      return false;
      
    case 'pause':
      pauseAudio();
      return false;
      
    case 'resume':
      resumeAudio();
      return false;
      
    case 'stop':
      stopAudio();
      return false;
  }
  return false;
});

// Split text into smaller chunks for faster start
function chunkText(text, maxLength = 500) {
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
  return chunks.filter(c => c.length > 0);
}

// Main speak function
async function speakText(text, apiKey, voiceId, speed) {
  stopAudio();
  
  if (!text || !text.trim()) {
    broadcastState('No content to read', false, false);
    return;
  }
  
  currentApiKey = apiKey;
  currentVoiceId = voiceId;
  currentSpeed = speed;
  
  // Smaller chunks = faster first audio
  const chunks = chunkText(text, 500);
  audioQueue = [...chunks];
  isPlaying = true;
  isPaused = false;
  
  console.log(`Starting TTS with ${chunks.length} chunks`);
  broadcastState(`Reading (${chunks.length} parts)...`, true, false);
  
  processQueue();
}

// Process audio queue
async function processQueue() {
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
    const remaining = audioQueue.length;
    
    try {
      broadcastState(`Reading (${remaining} left)...`, true, false);
      
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': currentApiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text: chunk,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API ${response.status}: ${errorText.substring(0, 100)}`);
      }
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      await playAudioUrl(audioUrl);
      URL.revokeObjectURL(audioUrl);
      
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

// Play audio URL
function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    audioElement = new Audio(url);
    audioElement.playbackRate = currentSpeed;
    
    audioElement.onended = () => {
      audioElement = null;
      resolve();
    };
    
    audioElement.onerror = (e) => {
      console.error('Audio error:', e);
      audioElement = null;
      resolve(); // Continue to next chunk instead of failing
    };
    
    audioElement.play().catch(err => {
      console.error('Play failed:', err);
      resolve(); // Continue anyway
    });
  });
}

// Pause audio
function pauseAudio() {
  if (audioElement && isPlaying) {
    audioElement.pause();
    isPaused = true;
    broadcastState('Paused', true, true);
  }
}

// Resume audio
function resumeAudio() {
  if (audioElement && isPaused) {
    audioElement.play();
    isPaused = false;
    broadcastState('Reading...', true, false);
  }
}

// Stop audio
function stopAudio() {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }
  audioQueue = [];
  isPlaying = false;
  isPaused = false;
}

// Broadcast state to popup
function broadcastState(status, playing, paused) {
  chrome.runtime.sendMessage({
    action: 'stateChange',
    status,
    isPlaying: playing,
    isPaused: paused
  }).catch(() => {});
}

// Extract readable content
function extractContent() {
  if (typeof Readability !== 'undefined') {
    try {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      if (article && article.textContent) {
        return cleanText(article.textContent);
      }
    } catch (err) {
      console.log('Readability failed:', err);
    }
  }
  return fallbackExtraction();
}

function fallbackExtraction() {
  const unwanted = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript'];
  const clone = document.body.cloneNode(true);
  unwanted.forEach(sel => clone.querySelectorAll(sel).forEach(el => el.remove()));
  const main = clone.querySelector('main, article, [role="main"], .content, .post');
  return cleanText((main || clone).textContent || '');
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}
