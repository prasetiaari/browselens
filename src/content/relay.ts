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

// ---- Custom Floating Popover Tools Capsule ----
let activeCtxMenu: HTMLDivElement | null = null;
let lastSelectedText = '';

function removeCustomContextMenu() {
  if (activeCtxMenu) {
    activeCtxMenu.remove();
    activeCtxMenu = null;
  }
}

// Extract selected text from standard selection or active input/textarea elements
function getSelectedText(): string {
  let text = '';
  const selection = window.getSelection();
  if (selection) {
    text = selection.toString().trim();
  }
  
  if (!text) {
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
      try {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          text = activeEl.value.substring(start, end).trim();
        }
      } catch (_) {}
    }
  }
  return text;
}

// Trigger popover display upon completing selection dragging
document.addEventListener('mouseup', (e) => {
  // Wait brief microtask to let browser finish updating text selection state
  setTimeout(() => {
    const selectedText = getSelectedText();
    
    if (!selectedText) {
      removeCustomContextMenu();
      lastSelectedText = '';
      return;
    }

    // Do not redraw if same selection is active
    if (selectedText === lastSelectedText && activeCtxMenu) {
      return;
    }
    
    lastSelectedText = selectedText;
    removeCustomContextMenu();

    // Inject popover styling
    if (!document.getElementById('browselens-ctx-styles')) {
      const style = document.createElement('style');
      style.id = 'browselens-ctx-styles';
      style.innerHTML = `
        #browselens-custom-ctx-menu {
          position: absolute;
          z-index: 2147483647;
          background: rgba(17, 23, 32, 0.96);
          backdrop-filter: blur(14px) saturate(180%);
          border: 1px solid rgba(0, 229, 255, 0.35);
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(0, 229, 255, 0.2);
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 0 6px;
          height: 36px;
          user-select: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          animation: blFloatingFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes blFloatingFadeIn {
          from { opacity: 0; transform: translateY(4px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .browselens-ctx-btn {
          border: none;
          background: none;
          color: #e4e8f0;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          border-radius: 14px;
          padding: 5px 8px;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
          font-family: inherit;
        }
        .browselens-ctx-btn:hover {
          background: rgba(0, 229, 255, 0.15);
          color: #00e5ff;
          text-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
          transform: translateY(-1px);
        }
        .browselens-ctx-divider {
          width: 1px;
          height: 16px;
          background: rgba(255, 255, 255, 0.12);
        }
      `;
      document.head.appendChild(style);
    }

    // Get position of selection to place popup accurately
    let selectionRect: DOMRect | null = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    }

    // Fallback if selection is inside an input/textarea
    if (!selectionRect || selectionRect.width === 0 || selectionRect.height === 0) {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        selectionRect = activeEl.getBoundingClientRect();
      }
    }

    if (!selectionRect) return;

    // Create capsule popup element
    const menu = document.createElement('div');
    menu.id = 'browselens-custom-ctx-menu';

    // Calculate absolute position
    const menuWidth = 320; 
    const menuHeight = 36;
    
    let top = selectionRect.top + window.scrollY - menuHeight - 8;
    let left = selectionRect.left + window.scrollX + (selectionRect.width / 2) - (menuWidth / 2);

    // Boundary protection
    if (top < window.scrollY + 8) {
      top = selectionRect.bottom + window.scrollY + 8; // Place below selection if off-screen top
    }
    if (left < window.scrollX + 8) {
      left = window.scrollX + 8;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    // Tool options definition
    const items = [
      { label: '🔓 Dec B64', type: 'TRIGGER_BASE64_DECODE' },
      { label: '🔢 Enc B64', type: 'TRIGGER_BASE64_ENCODE' },
      { label: '🔑 JWT', type: 'TRIGGER_JWT_DECODE' },
      { label: '🪄 Ask AI', type: 'TRIGGER_ASK_AI' }
    ];

    items.forEach((item, index) => {
      if (index > 0) {
        const div = document.createElement('div');
        div.className = 'browselens-ctx-divider';
        menu.appendChild(div);
      }

      const btn = document.createElement('button');
      btn.className = 'browselens-ctx-btn';
      btn.innerText = item.label;
      
      btn.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        
        if (item.type === 'TRIGGER_ASK_AI') {
          chrome.runtime.sendMessage({
            type: 'TRIGGER_ASK_AI',
            payload: { prompt: `Analyze and explain this string selected from the web page:\n\n"${selectedText}"` }
          }).catch(() => {});
        } else {
          chrome.runtime.sendMessage({
            type: item.type,
            payload: { text: selectedText }
          }).catch(() => {});
        }
        removeCustomContextMenu();
        lastSelectedText = '';
      });

      menu.appendChild(btn);
    });

    document.body.appendChild(menu);
    activeCtxMenu = menu;
  }, 10);
});

// Close popup when clicking outside
window.addEventListener('mousedown', (e) => {
  if (activeCtxMenu && !activeCtxMenu.contains(e.target as Node)) {
    // Small delay to allow click event to trigger first
    setTimeout(() => {
      removeCustomContextMenu();
      lastSelectedText = '';
    }, 150);
  }
});

// Close popup on scrolling or resizing
window.addEventListener('scroll', () => {
  removeCustomContextMenu();
  lastSelectedText = '';
}, { passive: true });

window.addEventListener('resize', () => {
  removeCustomContextMenu();
  lastSelectedText = '';
});

// Close popup on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    removeCustomContextMenu();
    lastSelectedText = '';
  }
});

console.log('[BrowseLens] Content script relay initialized');
