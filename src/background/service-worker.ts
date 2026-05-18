// ============================================================
// BrowseLens — Service Worker (Background Script)
// Central coordinator: stores requests, relays messages,
// handles AI chat, and executes request replays.
// ============================================================

import type {
  CapturedRequest,
  ExtensionMessage,
  ExtensionSettings,
  ChatEntry,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { AIAgent } from '../shared/ai/agent';

// ---- In-Memory State ----
let capturedRequests: CapturedRequest[] = [];
let chatHistory: ChatEntry[] = [];
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

// ---- Initialize ----
chrome.runtime.onInstalled.addListener(() => {
  console.log('[BrowseLens] Extension installed');
  loadSettings();
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings();
});

// Open side panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: Error) => console.error('[BrowseLens] Side panel error:', error));

// ---- Load Settings ----
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    if (stored.settings) {
      settings = { ...DEFAULT_SETTINGS, ...stored.settings };
    }
  } catch (err) {
    console.error('[BrowseLens] Failed to load settings:', err);
  }
}

// ---- Fallback WebRequest Capture ----
// Tracks requests across multiple events to gather headers and body
interface WebReqState {
  id: string;
  method: string;
  url: string;
  requestBody?: string;
  requestHeaders: Record<string, string>;
  timestamp: number;
}
const pendingWebRequests = new Map<string, WebReqState>();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (!settings.capture.enabled) return;
    if (details.url.startsWith('chrome-extension://') || details.url.includes('localhost:11434') || details.url.includes('localhost:1234')) return;

    let bodyStr = '';
    if (details.requestBody) {
      if (details.requestBody.raw && details.requestBody.raw[0].bytes) {
        bodyStr = new TextDecoder('utf-8').decode(details.requestBody.raw[0].bytes);
      } else if (details.requestBody.formData) {
        const params = new URLSearchParams();
        for (const [key, values] of Object.entries(details.requestBody.formData)) {
          for (const val of values) {
            params.append(key, typeof val === 'string' ? val : '[Binary File]');
          }
        }
        bodyStr = params.toString();
      }
    }

    pendingWebRequests.set(details.requestId, {
      id: `wr-${details.requestId}-${Date.now()}`,
      method: details.method,
      url: details.url,
      requestBody: bodyStr || undefined,
      requestHeaders: {},
      timestamp: details.timeStamp,
    });
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    const req = pendingWebRequests.get(details.requestId);
    if (req && details.requestHeaders) {
      details.requestHeaders.forEach(h => {
        if (h.name && h.value) req.requestHeaders[h.name] = h.value;
      });
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const req = pendingWebRequests.get(details.requestId);
    if (!req) return;
    pendingWebRequests.delete(details.requestId);

    const request: CapturedRequest = {
      id: req.id,
      timestamp: req.timestamp,
      tabId: details.tabId,
      source: 'devtools', // we use devtools tag so it looks consistent
      method: req.method,
      url: req.url,
      requestHeaders: req.requestHeaders,
      requestBody: req.requestBody,
      status: details.statusCode,
    };

    handleMessage({ type: 'REQUEST_CAPTURED', payload: request }, () => {});
  },
  { urls: ['<all_urls>'] }
);

// Clean up memory
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingWebRequests.entries()) {
    if (now - req.timestamp > 60000) pendingWebRequests.delete(id);
  }
}, 60000);

// ---- Message Handling ----
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message, sendResponse);
    return true; // Keep message channel open for async responses
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: unknown) => void
) {
  switch (message.type) {
    case 'REQUEST_CAPTURED': {
      const request = message.payload as CapturedRequest;
      
      // Check filter settings
      if (!settings.capture.enabled) {
        sendResponse({ success: false, reason: 'capture disabled' });
        return;
      }

      // Deduplicate by ID
      const existingIdx = capturedRequests.findIndex(r => r.id === request.id);
      if (existingIdx >= 0) {
        capturedRequests[existingIdx] = { ...capturedRequests[existingIdx], ...request };
      } else {
        capturedRequests.push(request);
      }

      // Keep max 1000 requests
      if (capturedRequests.length > 1000) {
        capturedRequests = capturedRequests.slice(-1000);
      }

      // Notify side panel of new request
      chrome.runtime.sendMessage({
        type: 'REQUEST_CAPTURED',
        payload: request,
      }).catch(() => {
        // Side panel might not be open
      });

      sendResponse({ success: true });
      break;
    }

    case 'GET_REQUESTS': {
      sendResponse({ requests: capturedRequests });
      break;
    }

    case 'CLEAR_REQUESTS': {
      capturedRequests = [];
      sendResponse({ success: true });
      break;
    }

    case 'REPLAY_REQUEST': {
      const { method, url, headers, body } = message.payload as {
        method: string;
        url: string;
        headers: Record<string, string>;
        body?: string;
      };

      try {
        const startTime = Date.now();
        const response = await fetch(url, {
          method,
          headers,
          body: body || undefined,
        });
        const duration = Date.now() - startTime;

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          responseBody = '[Could not read response body]';
        }

        sendResponse({
          success: true,
          response: {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody,
            duration,
          },
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'AI_CHAT': {
      const { message: userMsg } = message.payload as { message: string };

      try {
        const agent = new AIAgent(settings, capturedRequests, {
          onToolCall: (toolCall) => {
            chrome.runtime.sendMessage({
              type: 'AI_TOOL_CALL',
              payload: toolCall,
            }).catch(() => {});
          },
        });

        const result = await agent.chat(userMsg, chatHistory);

        // Save to history
        chatHistory.push({
          role: 'user',
          content: userMsg,
          timestamp: Date.now(),
        });
        chatHistory.push({
          role: 'assistant',
          content: result.content,
          toolCalls: result.toolCalls,
          timestamp: Date.now(),
        });

        // Keep history manageable
        if (chatHistory.length > 100) {
          chatHistory = chatHistory.slice(-100);
        }

        sendResponse({
          success: true,
          content: result.content,
          toolCalls: result.toolCalls,
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      break;
    }

    case 'GET_SETTINGS': {
      sendResponse({ settings });
      break;
    }

    case 'SAVE_SETTINGS': {
      settings = message.payload as ExtensionSettings;
      await chrome.storage.local.set({ settings });
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
}
