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
    case 'getContent':
      const text = extractContent();
      sendResponse({ text });
      break;
      
    case 'speakPage':
      const pageText = extractContent();
      speakText(pageText, message.apiKey, message.voiceId, message.speed);
      break;
      
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
  
  if (!text || !text.trim()) {
    broadcastState('No content to read', false, false);
    return;
  }
  
  currentApiKey = apiKey;
  currentVoiceId = voiceId;
  currentSpeed = speed;
  
  const chunks = chunkText(text);
  audioQueue = [...chunks];
  isPlaying = true;
  isPaused = false;
  
  broadcastState('Reading...', true, false);
  
  await processQueue();
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
    
    try {
      console.log('Fetching audio for chunk:', chunk.substring(0, 50) + '...');
      
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
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
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
      console.error('Audio playback error:', e);
      reject(new Error('Audio playback failed'));
    };
    
    audioElement.play().catch(reject);
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
  }).catch(() => {}); // Ignore if popup is closed
}

// Extract readable content from the page
function extractContent() {
  // Try Readability first if available
  if (typeof Readability !== 'undefined') {
    try {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (article && article.textContent) {
        return cleanText(article.textContent);
      }
    } catch (err) {
      console.log('Readability failed, falling back to basic extraction');
    }
  }
  
  // Fallback: basic content extraction
  return fallbackExtraction();
}

// Basic fallback extraction
function fallbackExtraction() {
  const unwanted = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    'iframe', 'noscript', '.ad', '.advertisement', '.sidebar',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
  ];
  
  const clone = document.body.cloneNode(true);
  
  unwanted.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  const mainContent = clone.querySelector('main, article, [role="main"], .content, .post, .entry');
  const textSource = mainContent || clone;
  
  return cleanText(textSource.textContent || textSource.innerText);
}

// Clean up extracted text
function cleanText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
