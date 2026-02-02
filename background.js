// Global state
let isPlaying = false;
let isPaused = false;
let playingTabId = null;
let currentStatus = 'Ready';

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'readSelection',
    title: 'Read with ElevenLabs',
    contexts: ['selection']
  });
});

// Update icon based on state
function updateIcon() {
  const iconPath = isPlaying 
    ? {
        16: 'icons/icon16-playing.png',
        48: 'icons/icon48-playing.png',
        128: 'icons/icon128-playing.png'
      }
    : {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png'
      };
  
  chrome.action.setIcon({ path: iconPath }).catch(() => {});
  
  // Also set badge
  if (isPlaying && !isPaused) {
    chrome.action.setBadgeText({ text: '▶' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else if (isPaused) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

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
    
    // Stop any existing playback first
    if (playingTabId && playingTabId !== tab.id) {
      chrome.tabs.sendMessage(playingTabId, { action: 'stop' }).catch(() => {});
    }
    
    await ensureContentScript(tab.id);
    playingTabId = tab.id;
    
    chrome.tabs.sendMessage(tab.id, {
      action: 'speak',
      text: info.selectionText,
      apiKey,
      voiceId: voiceId || 'DYkrAHD8iwork3YSUBbs',
      speed: speed || 1.0
    });
  }
});

// Handle messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getGlobalState':
      sendResponse({ 
        isPlaying, 
        isPaused, 
        playingTabId,
        status: currentStatus
      });
      return false;
      
    case 'stateChange':
      isPlaying = message.isPlaying;
      isPaused = message.isPaused;
      currentStatus = message.status || 'Ready';
      if (sender.tab) {
        playingTabId = message.isPlaying ? sender.tab.id : null;
      }
      updateIcon();
      return false;
      
    case 'speakPage':
      (async () => {
        // Stop any existing playback
        if (playingTabId) {
          chrome.tabs.sendMessage(playingTabId, { action: 'stop' }).catch(() => {});
        }
        
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          await ensureContentScript(tabs[0].id);
          playingTabId = tabs[0].id;
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'speakPage',
            apiKey: message.apiKey,
            voiceId: message.voiceId,
            speed: message.speed
          });
        }
      })();
      return false;
      
    case 'pause':
    case 'resume':
      if (playingTabId) {
        chrome.tabs.sendMessage(playingTabId, { action: message.action }).catch(() => {});
      }
      return false;
      
    case 'stop':
      if (playingTabId) {
        chrome.tabs.sendMessage(playingTabId, { action: 'stop' }).catch(() => {});
        playingTabId = null;
        isPlaying = false;
        isPaused = false;
        currentStatus = 'Stopped';
        updateIcon();
      }
      return false;
  }
  return false;
});

// Clean up if playing tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === playingTabId) {
    playingTabId = null;
    isPlaying = false;
    isPaused = false;
    currentStatus = 'Ready';
    updateIcon();
  }
});
