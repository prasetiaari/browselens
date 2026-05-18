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
import { runPassiveScan } from '../shared/scanner';

// ---- In-Memory State ----
let capturedRequests: CapturedRequest[] = [];
let chatHistory: ChatEntry[] = [];
let settings: ExtensionSettings = { ...DEFAULT_SETTINGS };

// ---- Load Settings & Requests ----
function getActiveProject() {
  const projId = settings.currentProjectId || 'default';
  let activeProj = (settings.projects || []).find(p => p.id === projId);
  if (!activeProj) {
    activeProj = {
      id: 'default',
      name: 'Default Project',
      createdAt: Date.now(),
      targetScope: settings.capture.targetScope || '',
      customHeaders: settings.customHeaders || [],
    };
  }
  return activeProj;
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    if (stored.settings) {
      settings = { ...DEFAULT_SETTINGS, ...stored.settings };
    }

    let hasChanges = false;
    // Auto-migration to dynamic projects on first launch
    if (!settings.projects || settings.projects.length === 0) {
      const legacyScope = settings.capture.targetScope || '';
      const legacyHeaders = settings.customHeaders || [];

      settings.projects = [
        {
          id: 'default',
          name: 'Default Project',
          createdAt: Date.now(),
          targetScope: legacyScope,
          customHeaders: legacyHeaders,
        }
      ];
      settings.currentProjectId = 'default';
      hasChanges = true;
    }

    if (hasChanges) {
      await chrome.storage.local.set({ settings });
    }
  } catch (err) {
    console.error('[BrowseLens] Failed to load settings:', err);
  }
}

async function loadRequests() {
  try {
    const projId = settings.currentProjectId || 'default';
    const storageKey = `requests_${projId}`;
    const stored = await chrome.storage.local.get(storageKey);

    if (stored[storageKey]) {
      capturedRequests = stored[storageKey] as CapturedRequest[];
    } else {
      // Migrate old global requests to requests_default
      if (projId === 'default') {
        const oldStored = await chrome.storage.local.get('capturedRequests');
        if (oldStored.capturedRequests && Array.isArray(oldStored.capturedRequests) && oldStored.capturedRequests.length > 0) {
          capturedRequests = oldStored.capturedRequests;
          await chrome.storage.local.set({ [storageKey]: capturedRequests });
          await chrome.storage.local.remove('capturedRequests');
          console.log('[BrowseLens] Successfully migrated legacy requests to requests_default.');
        } else {
          capturedRequests = [];
        }
      } else {
        capturedRequests = [];
      }
    }
  } catch (err) {
    console.error('[BrowseLens] Failed to load requests:', err);
    capturedRequests = [];
  }
}

async function saveRequests() {
  try {
    const projId = settings.currentProjectId || 'default';
    const storageKey = `requests_${projId}`;
    await chrome.storage.local.set({ [storageKey]: capturedRequests });
  } catch (err) {
    console.error('[BrowseLens] Failed to save requests:', err);
  }
}

// ---- DeclarativeNetRequest Custom Headers ----
async function updateHeaderRules() {
  if (!chrome.declarativeNetRequest) return;

  try {
    // 1. Get all current dynamic rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);

    // 2. Remove all existing rules
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds
    });

    // 3. Build new rules based on active project customHeaders
    const activeProject = getActiveProject();
    const headersToInject = (activeProject.customHeaders || []).filter(h => h.enabled && h.name.trim() !== '');
    if (headersToInject.length === 0) {
      console.log('[BrowseLens] No active custom headers to inject for project:', activeProject.name);
      return;
    }

    const rules: chrome.declarativeNetRequest.Rule[] = [];
    
    // Check if we have dynamic scopes to target
    let domains: string[] = [];
    if (activeProject.targetScope && activeProject.targetScope.trim() !== '') {
      domains = activeProject.targetScope
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    }

    // Build the requestHeaders array for declarativeNetRequest action
    const requestHeadersOption = headersToInject.map(h => ({
      header: h.name.trim(),
      operation: 'set' as const,
      value: h.value
    }));

    if (domains.length > 0) {
      // Create separate rules for each domain in the scope
      domains.forEach((domain, idx) => {
        rules.push({
          id: idx + 1,
          priority: 1,
          action: {
            type: 'modifyHeaders' as const,
            requestHeaders: requestHeadersOption,
          },
          condition: {
            urlFilter: `*://${domain}/*`,
            resourceTypes: [
              'main_frame' as const,
              'sub_frame' as const,
              'stylesheet' as const,
              'script' as const,
              'image' as const,
              'font' as const,
              'object' as const,
              'xmlhttprequest' as const,
              'ping' as const,
              'csp_report' as const,
              'media' as const,
              'websocket' as const,
              'other' as const
            ]
          }
        });
      });
    } else {
      // Global injection (all URLs)
      rules.push({
        id: 1,
        priority: 1,
        action: {
          type: 'modifyHeaders' as const,
          requestHeaders: requestHeadersOption,
        },
        condition: {
          urlFilter: '*',
          resourceTypes: [
            'main_frame' as const,
            'sub_frame' as const,
            'stylesheet' as const,
            'script' as const,
            'image' as const,
            'font' as const,
            'object' as const,
            'xmlhttprequest' as const,
            'ping' as const,
            'csp_report' as const,
            'media' as const,
            'websocket' as const,
            'other' as const
          ]
        }
      });
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });
      console.log(`[BrowseLens] Successfully injected ${headersToInject.length} custom headers into declarative rules for project: ${activeProject.name}`);
    }
  } catch (err) {
    console.error('[BrowseLens] Failed to update dynamic header injection rules:', err);
  }
}

// ---- Initialize ----
async function init() {
  await loadSettings();
  await loadRequests();
  try {
    await updateHeaderRules();
  } catch (err) {
    console.error('[BrowseLens] Failed to update header rules on init:', err);
  }
}
init();

// Open side panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: Error) => console.error('[BrowseLens] Side panel error:', error));

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
      if (!request || !request.url) {
        sendResponse({ success: false, reason: 'invalid request payload' });
        return;
      }
      
      // Check filter settings
      if (!settings.capture.enabled) {
        sendResponse({ success: false, reason: 'capture disabled' });
        return;
      }

      // Check Target Scope for active project
      const activeProject = getActiveProject();
      if (activeProject.targetScope && activeProject.targetScope.trim() !== '') {
        const scopes = activeProject.targetScope.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const reqUrl = (request.url || '').toLowerCase();
        let inScope = false;
        
        for (const scope of scopes) {
          if (reqUrl.includes(scope)) {
            inScope = true;
            break;
          }
        }
        
        if (!inScope) {
           sendResponse({ success: false, reason: 'out of scope' });
           return;
        }
      }

      // Deduplicate by ID
      let mergedRequest = request;
      const existingIdx = capturedRequests.findIndex(r => r.id === request.id);
      if (existingIdx >= 0) {
        capturedRequests[existingIdx] = { ...capturedRequests[existingIdx], ...request };
        mergedRequest = capturedRequests[existingIdx];
      } else {
        capturedRequests.push(request);
      }

      // Run passive scanner
      try {
        mergedRequest.vulnerabilities = runPassiveScan(mergedRequest);
      } catch (err) {
        console.error('[BrowseLens] Passive scan failed:', err);
      }

      // Keep max 1000 requests
      if (capturedRequests.length > 1000) {
        capturedRequests = capturedRequests.slice(-1000);
      }

      saveRequests();

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

    case 'UPDATE_REQUEST_TAG': {
      const { id, tag } = message.payload as { id: string; tag: 'red' | 'yellow' | 'green' | 'none' };
      const req = capturedRequests.find(r => r.id === id);
      if (req) {
        req.tag = tag;
        saveRequests();
        // Broadcast update to side panels
        chrome.runtime.sendMessage({
          type: 'REQUEST_CAPTURED',
          payload: req,
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
    }

    case 'GET_REQUESTS': {
      sendResponse({ requests: capturedRequests });
      break;
    }

    case 'SET_REQUESTS': {
      capturedRequests = message.payload as CapturedRequest[];
      saveRequests();
      sendResponse({ success: true });
      break;
    }

    case 'CLEAR_REQUESTS': {
      capturedRequests = [];
      saveRequests();
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

        // Create CapturedRequest representation for Requester/Repeater replayed requests
        const replayedRequest: CapturedRequest = {
          id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          timestamp: startTime,
          source: 'requester',
          method,
          url,
          requestHeaders: headers,
          requestBody: body || undefined,
          requestBodySize: body ? body.length : 0,
          status: response.status,
          statusText: response.statusText,
          responseHeaders,
          responseBody: responseBody,
          responseBodySize: responseBody.length,
          mimeType: responseHeaders['content-type'] || responseHeaders['Content-Type'] || 'text/plain',
          duration,
        };

        // Passive scan and save to project history
        try {
          replayedRequest.vulnerabilities = runPassiveScan(replayedRequest);
        } catch (scanErr) {
          console.error('[BrowseLens] Passive scan failed for replayed request:', scanErr);
        }

        capturedRequests.push(replayedRequest);
        if (capturedRequests.length > 1000) {
          capturedRequests = capturedRequests.slice(-1000);
        }
        saveRequests();

        // Broadcast to all open side panels so they update dynamically in real time
        chrome.runtime.sendMessage({
          type: 'REQUEST_CAPTURED',
          payload: replayedRequest,
        }).catch(() => {});

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
      try {
        await updateHeaderRules();
      } catch (err) {
        console.error('[BrowseLens] Failed to update header rules on save settings:', err);
      }
      sendResponse({ success: true });
      break;
    }

    case 'SWITCH_PROJECT': {
      const { projectId } = message.payload as { projectId: string };
      settings.currentProjectId = projectId;
      await chrome.storage.local.set({ settings });
      
      // Load the new requests partition
      await loadRequests();
      
      // Update header rules for the new active project settings
      try {
        await updateHeaderRules();
      } catch (err) {
        console.error('[BrowseLens] Failed to update header rules on switch project:', err);
      }
      
      // Send back the newly loaded requests list
      sendResponse({ success: true, requests: capturedRequests });
      break;
    }

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
}
