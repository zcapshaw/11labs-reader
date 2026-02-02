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
    // Try to ping the content script
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
  } catch (e) {
    // Content script not loaded, inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/Readability.js', 'content.js']
    });
    // Small delay to let it initialize
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
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  switch (message.action) {
    case 'speakPage':
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await ensureContentScript(tabs[0].id);
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'speakPage',
          apiKey: message.apiKey,
          voiceId: message.voiceId,
          speed: message.speed
        });
      }
      break;
      
    case 'pause':
    case 'resume':
    case 'stop':
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs[0]) {
        chrome.tabs.sendMessage(activeTabs[0].id, { action: message.action }).catch(() => {});
      }
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
}
