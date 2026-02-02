// State
let isPlaying = false;
let isPaused = false;

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'readSelection',
    title: 'Read with ElevenLabs',
    contexts: ['selection']
  });
});

// Ensure content script is injected
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/Readability.js', 'content.js']
    });
    await new Promise(r => setTimeout(r, 100));
  }
}

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'readSelection' && info.selectionText) {
    const { apiKey, voiceId, speed } = await chrome.storage.sync.get(['apiKey', 'voiceId', 'speed']);
    
    if (!apiKey) {
      console.error('No API key configured');
      return;
    }
    
    await ensureContentScript(tab.id);
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'speak',
      text: info.selectionText,
      apiKey,
      voiceId: voiceId || 'DYkrAHD8iwork3YSUBbs',
      speed: speed || 1.0
    });
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle sync messages immediately
  if (message.action === 'getState') {
    sendResponse({ isPlaying, isPaused });
    return false;
  }
  
  if (message.action === 'stateChange') {
    isPlaying = message.isPlaying;
    isPaused = message.isPaused;
    return false;
  }
  
  // Handle async messages
  (async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) return;
      
      if (message.action === 'speakPage') {
        await ensureContentScript(tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'speakPage',
          apiKey: message.apiKey,
          voiceId: message.voiceId,
          speed: message.speed
        });
      } else if (['pause', 'resume', 'stop'].includes(message.action)) {
        chrome.tabs.sendMessage(tabs[0].id, { action: message.action }).catch(() => {});
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  })();
  
  return false; // Don't keep channel open
});
