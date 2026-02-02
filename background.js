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

// Handle context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'readSelection' && info.selectionText) {
    const { apiKey, voiceId, speed } = await chrome.storage.sync.get(['apiKey', 'voiceId', 'speed']);
    
    if (!apiKey) {
      console.error('No API key configured');
      return;
    }
    
    // Send to content script to play
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
  switch (message.action) {
    case 'speakPage':
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'speakPage',
            apiKey: message.apiKey,
            voiceId: message.voiceId,
            speed: message.speed
          });
        }
      });
      break;
      
    case 'pause':
    case 'resume':
    case 'stop':
      // Forward to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: message.action });
        }
      });
      break;
      
    case 'stateChange':
      // Relay state from content script to popup
      isPlaying = message.isPlaying;
      isPaused = message.isPaused;
      break;
      
    case 'getState':
      sendResponse({ isPlaying, isPaused });
      break;
  }
  return true;
});
