// ============================================================
// BrowseLens — Content Script Relay (ISOLATED World)
// Listens for postMessage from the MAIN world content script
// and relays it to the Service Worker via chrome.runtime.
// ============================================================

window.addEventListener('message', (event) => {
  // We only accept messages from ourselves
  if (event.source !== window || !event.data) return;

  if (event.data.source === 'browselens-content' && event.data.payload) {
    try {
      chrome.runtime.sendMessage({
        type: 'REQUEST_CAPTURED',
        payload: event.data.payload
      }).catch(() => {
        // Ignore "Extension context invalidated" or similar errors when disconnected
      });
    } catch (err) {
      // Ignore errors when extension is reloaded
    }
  }
});

console.log('[BrowseLens] Content script relay initialized');
