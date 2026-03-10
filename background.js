// Save install timestamp on first install (used for feedback popup timing)
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ installTimestamp: Date.now() });
  }
});

// Background service worker to handle extension icon click
chrome.action.onClicked.addListener(() => {
  // Open extension in a new tab
  chrome.tabs.create({
    url: 'popup.html'
  });
});

// Listen for clipboard events from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('QuickLinks: Received message:', message.type);
  
  if (message.type === 'clipboard-copy' || message.type === 'clipboard-paste') {
    const text = message.text;
    
    if (!text || !text.trim()) {
      console.log('QuickLinks: Empty text, ignoring');
      return;
    }
    
    console.log('QuickLinks: Adding to clipboard:', text.substring(0, 50));
    
    // Get current clipboard data from storage
    chrome.storage.local.get(['clipboard'], (result) => {
      let clipboard = result.clipboard || [];
      
      // Don't add if it's the same as the last item
      if (clipboard.length > 0 && clipboard[0].text === text) {
        console.log('QuickLinks: Duplicate, ignoring');
        return;
      }
      
      // Add new item
      const item = {
        id: Date.now().toString(),
        text: text,
        timestamp: message.timestamp || new Date().toISOString()
      };
      
      clipboard.unshift(item);
      
      // Keep only last 15 items
      if (clipboard.length > 15) {
        clipboard = clipboard.slice(0, 15);
      }
      
      console.log('QuickLinks: Saving clipboard, total items:', clipboard.length);
      
      // Save to storage
      chrome.storage.local.set({ clipboard }, () => {
        console.log('QuickLinks: Clipboard saved successfully');
        
        // Notify all extension pages to refresh
        chrome.runtime.sendMessage({
          type: 'clipboard-updated',
          clipboard: clipboard
        }).catch((err) => {
          console.log('QuickLinks: No extension page listening:', err);
        });
      });
    });
  }
  
  // For clipboard query from popup
  if (message.type === 'get-clipboard') {
    chrome.storage.local.get(['clipboard'], (result) => {
      sendResponse({ clipboard: result.clipboard || [] });
    });
    return true; // Keep channel open for async response
  }
});

console.log('QuickLinks: Background script loaded');
