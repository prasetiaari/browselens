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
        type: 'DEVTOOLS_REQUEST_CAPTURED',
        payload: event.data.payload
      }).catch(() => {
        // Ignore disconnected context errors
      });
    } catch (err) {
      // Ignore
    }
  }
});

let highlighterActive = false;

function removeHighlights() {
  highlighterActive = false;
  document.querySelectorAll('.browselens-highlight-overlay').forEach(el => el.remove());
  document.querySelectorAll('.browselens-form-highlight').forEach(el => {
    el.classList.remove('browselens-form-highlight');
  });
  document.querySelectorAll('.browselens-link-highlight').forEach(el => {
    el.classList.remove('browselens-link-highlight');
  });
  const styleEl = document.getElementById('browselens-highlight-styles');
  if (styleEl) styleEl.remove();
}

function applyHighlights() {
  highlighterActive = true;
  if (!document.getElementById('browselens-highlight-styles')) {
    const style = document.createElement('style');
    style.id = 'browselens-highlight-styles';
    style.innerHTML = `
      .browselens-form-highlight {
        outline: 2px dashed #ff3366 !important;
        outline-offset: 4px !important;
        position: relative !important;
        box-shadow: 0 0 12px rgba(255, 51, 102, 0.4) !important;
      }
      .browselens-link-highlight {
        outline: 2px dashed #00e5ff !important;
        outline-offset: 2px !important;
        position: relative !important;
        box-shadow: 0 0 8px rgba(0, 229, 255, 0.3) !important;
      }
      .browselens-badge {
        position: absolute !important;
        background: #111720 !important;
        color: #e4e8f0 !important;
        padding: 3px 6px !important;
        border-radius: 4px !important;
        font-family: monospace !important;
        font-size: 10px !important;
        font-weight: bold !important;
        z-index: 100000 !important;
        pointer-events: none !important;
        box-shadow: 0 2px 6px rgba(0,0,0,0.5) !important;
        white-space: nowrap !important;
      }
      .browselens-badge-form {
        border: 1px solid #ff3366 !important;
        color: #ff3366 !important;
      }
      .browselens-badge-link {
        border: 1px solid #00e5ff !important;
        color: #00e5ff !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Highlight all forms
  const forms = document.querySelectorAll('form');
  forms.forEach((form) => {
    form.classList.add('browselens-form-highlight', 'browselens-highlight-overlay');
    const rect = form.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'browselens-badge browselens-badge-form browselens-highlight-overlay';
    const method = form.getAttribute('method') || 'GET';
    const action = form.getAttribute('action') || '(no-action)';
    badge.innerText = `📄 FORM [${method.toUpperCase()}] ➔ ${action}`;
    badge.style.top = `${window.scrollY + rect.top - 20}px`;
    badge.style.left = `${window.scrollX + rect.left}px`;
    document.body.appendChild(badge);
  });

  // Highlight all hyperlinks
  const links = document.querySelectorAll('a');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    link.classList.add('browselens-link-highlight', 'browselens-highlight-overlay');
    const rect = link.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'browselens-badge browselens-badge-link browselens-highlight-overlay';
    badge.innerText = `🌐 LINK ➔ ${href}`;
    badge.style.top = `${window.scrollY + rect.top - 18}px`;
    badge.style.left = `${window.scrollX + rect.left}px`;
    document.body.appendChild(badge);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BROWSELENS_TOGGLE_HIGHLIGHTS') {
    if (highlighterActive) {
      removeHighlights();
    } else {
      applyHighlights();
    }
    sendResponse({ active: highlighterActive });
  }
});

console.log('[BrowseLens] Content script relay initialized');
