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

// -------------------------------------------------------------------
// Helper: truncate strings to a size safe for chrome.storage payload
// With unlimitedStorage permission, we can easily store 150KB per item.
function safeTruncate(body: string | undefined, maxChars: number = 150000): string | undefined {
  if (!body) return body;
  return body.length > maxChars ? body.substring(0, maxChars) + '\n...[truncated to fit storage limit]' : body;
}
// -------------------------------------------------------------------

// ---- In-Memory State ----
let capturedRequests: CapturedRequest[] = [];
let requestCounter: number = 1;
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

function isUrlInScope(urlStr?: string): boolean {
  if (!urlStr) return false;
  
  // Exclude chrome internal schemes immediately
  if (urlStr.startsWith('chrome://') || urlStr.startsWith('chrome-extension://')) {
    return false;
  }

  const activeProject = getActiveProject();
  
  // 1. Target Scope Check
  if (activeProject.targetScope && activeProject.targetScope.trim() !== '') {
    const scopes = activeProject.targetScope.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const reqUrl = urlStr.toLowerCase();
    
    let hostname = '';
    try {
      hostname = new URL(reqUrl).hostname;
    } catch (_) {
      hostname = reqUrl;
    }

    let inScope = false;
    for (const scope of scopes) {
      const cleanScope = scope.startsWith('*.') ? scope.slice(2) : scope;
      if (hostname === cleanScope || hostname.endsWith(`.${cleanScope}`)) {
        inScope = true;
        break;
      }
    }

    if (!inScope) {
      return false; // Out of target scope
    }
  }

  // 2. Exclude Scope Check
  if (activeProject.excludeScope && activeProject.excludeScope.trim() !== '') {
    const excludes = activeProject.excludeScope.split(',').map(s => s.trim()).filter(Boolean);
    const reqUrl = urlStr.toLowerCase();
    let hostname = '';
    try {
      hostname = new URL(reqUrl).hostname;
    } catch (_) {
      hostname = reqUrl;
    }

    let excluded = false;
    for (const item of excludes) {
      const lowerItem = item.toLowerCase();
      
      // Regex Match (e.g. /activeview|worklet/i)
      if (item.startsWith('/') && item.lastIndexOf('/') > 0) {
        try {
          const lastSlashIdx = item.lastIndexOf('/');
          const pattern = item.slice(1, lastSlashIdx);
          const flags = item.slice(lastSlashIdx + 1);
          const regex = new RegExp(pattern, flags.includes('i') ? 'i' : '');
          if (regex.test(urlStr)) {
            excluded = true;
            break;
          }
        } catch (_) {}
      }
      // Wildcard Subdomains Match (e.g., "*.doubleclick.net")
      else if (lowerItem.startsWith('*.')) {
        const base = lowerItem.slice(2);
        if (hostname === base || hostname.endsWith(`.${base}`)) {
          excluded = true;
          break;
        }
      } 
      // Substring / Exact Host Match
      else {
        if (hostname.includes(lowerItem) || reqUrl.includes(lowerItem)) {
          excluded = true;
          break;
        }
      }
    }

    if (excluded) {
      return false; // Excluded!
    }
  }

  // If we passed all checks (or none were defined), it is in-scope!
  return true;
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    if (stored.settings) {
      const s = stored.settings as ExtensionSettings;
      // Deep merge to prevent nested objects (capture, ai) from being wiped out
      settings = {
        ...DEFAULT_SETTINGS,
        ...s,
        capture: { ...DEFAULT_SETTINGS.capture, ...(s.capture || {}) },
        ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai || {}) },
      };
    }
    console.log('[BrowseLens] loadSettings complete. capture.enabled=', settings.capture.enabled, 'projectId=', settings.currentProjectId);

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

async function logDebug(msg: string) {
  try {
    const stored = await chrome.storage.local.get('debug_log');
    const logs = (stored.debug_log || []) as string[];
    logs.push(`[${new Date().toISOString()}] ${msg}`);
    await chrome.storage.local.set({ debug_log: logs.slice(-100) });
  } catch (err) {
    console.error('Debug log fail:', err);
  }
}

async function loadRequests() {
  try {
    const projId = settings.currentProjectId || 'default';
    const indexKey = `requests_index_${projId}`;
    logDebug(`loadRequests called - projId: ${projId}`);
    
    // 1. Get request IDs index
    const storedIndex = await chrome.storage.local.get(indexKey);
    let index = (storedIndex[indexKey] || []) as string[];
    logDebug(`loadRequests - retrieved index length: ${index.length}`);
    
    // 2. Self-Healing: Reconstruct index if it's missing/empty but orphaned rows exist
    if (index.length === 0) {
      const allStored = await chrome.storage.local.get(null);
      const prefix = `request_${projId}_`;
      const orphanedRequests: CapturedRequest[] = [];
      
      Object.keys(allStored).forEach(key => {
        if (key.startsWith(prefix)) {
          const req = allStored[key] as CapturedRequest;
          if (req && req.id) {
            orphanedRequests.push(req);
          }
        }
      });
      
      if (orphanedRequests.length > 0) {
        // Sort chronologically by timestamp
        orphanedRequests.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        index = orphanedRequests.map(r => r.id);
        await chrome.storage.local.set({ [indexKey]: index });
        logDebug(`loadRequests - self-healed index length: ${index.length}`);
      }
    }
    
    if (index.length > 0) {
      // 3. Fetch all request objects in a single batch query
      const requestKeys = index.map(id => `request_${projId}_${id}`);
      const storedRequests = await chrome.storage.local.get(requestKeys);
      
      // 4. Reconstruct in original order
      capturedRequests = index
        .map(id => storedRequests[`request_${projId}_${id}`])
        .filter(Boolean) as CapturedRequest[];
      logDebug(`loadRequests - reconstructed capturedRequests length: ${capturedRequests.length}`);
    } else {
      // Fallback: check if legacy full-array key exists for this project
      const legacyKey = `requests_${projId}`;
      const storedLegacy = await chrome.storage.local.get(legacyKey);
      if (storedLegacy[legacyKey] && Array.isArray(storedLegacy[legacyKey])) {
        capturedRequests = storedLegacy[legacyKey];
        // Migrate to new row structure
        await saveRequests();
        // Clean up legacy key
        await chrome.storage.local.remove(legacyKey);
        logDebug(`loadRequests - migrated legacy array, length: ${capturedRequests.length}`);
      } else {
        // Migrate old global requests to requests_default
        if (projId === 'default') {
          const oldStored = await chrome.storage.local.get('capturedRequests');
          if (oldStored.capturedRequests && Array.isArray(oldStored.capturedRequests) && oldStored.capturedRequests.length > 0) {
            capturedRequests = oldStored.capturedRequests;
            await saveRequests();
            await chrome.storage.local.remove('capturedRequests');
            logDebug(`loadRequests - migrated old global requests, length: ${capturedRequests.length}`);
          } else {
            capturedRequests = [];
          }
        } else {
          capturedRequests = [];
        }
      }
    }
    
    // Compute requestCounter for shortId assignment
    requestCounter = capturedRequests.length > 0 
      ? Math.max(...capturedRequests.map(r => parseInt(r.shortId || '0', 10) || 0)) + 1 
      : 1;

  } catch (err) {
    console.error('[BrowseLens] Failed to load requests:', err);
    logDebug(`loadRequests FAILED: ${err}`);
    capturedRequests = [];
    requestCounter = 1;
  }
}

async function saveSingleRequest(req: CapturedRequest) {
  try {
    const projId = settings.currentProjectId || 'default';
    const requestKey = `request_${projId}_${req.id}`;
    const indexKey = `requests_index_${projId}`;
    
    // Generate index synchronously from memory (guarantees race-condition free, instant execution!)
    const index = capturedRequests.map(r => r.id);
    logDebug(`saveSingleRequest - projId: ${projId}, reqId: ${req.id}, memory index size: ${index.length}`);
    
    // Save index and request object in parallel
    await chrome.storage.local.set({
      [indexKey]: index,
      [requestKey]: req
    });
    
    // Double check write
    const checkIndex = await chrome.storage.local.get(indexKey);
    const checkLen = ((checkIndex[indexKey] || []) as string[]).length;
    logDebug(`saveSingleRequest - write complete. Verified storage index size: ${checkLen}`);
  } catch (err) {
    console.error('[BrowseLens] Failed to save single request:', err);
    logDebug(`saveSingleRequest FAILED: ${err}`);
  }
}

async function saveRequests() {
  try {
    const projId = settings.currentProjectId || 'default';
    const indexKey = `requests_index_${projId}`;
    const index = capturedRequests.map(r => r.id);
    
    const payload: Record<string, any> = {
      [indexKey]: index
    };
    
    // Batch payload rows
    capturedRequests.forEach(req => {
      payload[`request_${projId}_${req.id}`] = req;
    });
    
    await chrome.storage.local.set(payload);
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

    // 3. Build new rules based on active project customHeaders and matchReplaceRules
    const activeProject = getActiveProject();
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    let ruleId = 1;

    // Check if we have dynamic scopes to target
    let domains: string[] = [];
    if (activeProject.targetScope && activeProject.targetScope.trim() !== '') {
      domains = activeProject.targetScope
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    }

    // A. CUSTOM HEADERS rules
    const headersToInject = (activeProject.customHeaders || []).filter(h => h.enabled && h.name.trim() !== '');
    if (headersToInject.length > 0) {
      const requestHeadersOption = headersToInject.map(h => ({
        header: h.name.trim(),
        operation: 'set' as const,
        value: h.value
      }));

      if (domains.length > 0) {
        domains.forEach((domain) => {
          rules.push({
            id: ruleId++,
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
        rules.push({
          id: ruleId++,
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
    }

    // B. MATCH & REPLACE rules (Chrome DeclarativeNetRequest Request Header overrides)
    const activeMRRules = (activeProject.matchReplaceRules || []).filter(r => r.enabled && r.match.trim() !== '');
    
    // We filter down to 'requestHeader' overrides that are fully supported in DNR
    const mrHeaders = activeMRRules.filter(r => r.type === 'requestHeader');
    if (mrHeaders.length > 0) {
      const requestHeadersOptionMR = mrHeaders.map(mr => ({
        header: mr.match.trim(),
        operation: 'set' as const,
        value: mr.replace
      }));

      if (domains.length > 0) {
        domains.forEach((domain) => {
          rules.push({
            id: ruleId++,
            priority: 2, // Higher priority so match & replace overrides default custom headers
            action: {
              type: 'modifyHeaders' as const,
              requestHeaders: requestHeadersOptionMR,
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
        rules.push({
          id: ruleId++,
          priority: 2,
          action: {
            type: 'modifyHeaders' as const,
            requestHeaders: requestHeadersOptionMR,
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
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: rules
      });
      console.log(`[BrowseLens] DeclarativeNetRequest updated. Generated ${rules.length} active routing rule blocks.`);
    }
  } catch (err) {
    console.error('[BrowseLens] Failed to update dynamic header injection rules:', err);
  }
}

// ---- Initialize ----
let initPromise: Promise<void> | null = null;
function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await loadSettings();
      await loadRequests();
      try {
        await updateHeaderRules();
      } catch (err) {
        console.error('[BrowseLens] Failed to update header rules on init:', err);
      }
    })();
  }
  return initPromise;
}
ensureInit();

// Open side panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error: Error) => console.error('[BrowseLens] Side panel error:', error));

// ---- Debugger Capture (Replaces WebRequest) ----
class DebuggerManager {
  public attachedTabIds = new Set<number>();
  public trackedTabIds = new Set<number>();
  private pendingRequests = new Map<string, Partial<CapturedRequest>>();

  trackTab(tabId: number) {
    this.trackedTabIds.add(tabId);
  }

  untrackTab(tabId: number) {
    this.trackedTabIds.delete(tabId);
    this.detach(tabId);
  }

  untrackAll() {
    this.trackedTabIds.clear();
    this.detachAll();
  }

  async attachToTab(tabId: number) {
    if (!settings.capture.enabled) return;
    if (this.attachedTabIds.has(tabId)) return;

    try {
      this.attachedTabIds.add(tabId);
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      console.log(`[BrowseLens] Debugger attached to tab ${tabId}`);
    } catch (err) {
      console.error(`[BrowseLens] Failed to attach debugger to ${tabId}:`, err);
      this.attachedTabIds.delete(tabId);
    }
  }

  async detach(tabId: number) {
    if (this.attachedTabIds.has(tabId)) {
      this.attachedTabIds.delete(tabId);
      try {
        await chrome.debugger.detach({ tabId });
      } catch (err) {
        // Ignore detach errors
      }
    }
  }

  async detachAll() {
    for (const tabId of this.attachedTabIds) {
      await this.detach(tabId);
    }
    this.pendingRequests.clear();
  }

  handleEvent(source: chrome.debugger.Debuggee, method: string, params: any) {
    if (!source.tabId || !this.attachedTabIds.has(source.tabId)) return;

    const requestId = params.requestId;

    if (method === 'Network.requestWillBeSent') {
      if (!params.request.url) return;
      if (params.request.url.startsWith('chrome-extension://') || params.request.url.includes('localhost:11434') || params.request.url.includes('localhost:1234')) return;

      this.pendingRequests.set(requestId, {
        id: `dbg-${requestId}-${Date.now()}`,
        shortId: (requestCounter++).toString(),
        timestamp: Date.now(),
        tabId: source.tabId,
        source: 'devtools',
        method: params.request.method,
        url: params.request.url,
        requestHeaders: params.request.headers || {},
        requestBody: params.request.postData || undefined,
        requestBodySize: params.request.postData?.length || 0,
      });
    } else if (method === 'Network.responseReceived') {
      const req = this.pendingRequests.get(requestId);
      if (req) {
        req.status = params.response.status;
        req.statusText = params.response.statusText;
        req.responseHeaders = params.response.headers || {};
        req.mimeType = params.response.mimeType;
        req.remoteIp = params.response.remoteIPAddress;
        req.remotePort = params.response.remotePort;
      }
    } else if (method === 'Network.loadingFinished') {
      const req = this.pendingRequests.get(requestId);
      if (req) {
        // Fetch body
        chrome.debugger.sendCommand(source, 'Network.getResponseBody', { requestId }, (response: any) => {
          if (chrome.runtime.lastError) {
            req.responseBody = '[error reading body: ' + chrome.runtime.lastError.message + ']';
          } else if (response && response.body) {
            req.responseBody = response.base64Encoded ? `[Base64 encoded content, ${response.body.length} chars]` : response.body;
            req.responseBodySize = response.body.length;
          } else {
             req.responseBody = '[empty body]';
          }
          
          handleMessage({ type: 'REQUEST_CAPTURED', payload: req as CapturedRequest }, () => {});
          this.pendingRequests.delete(requestId);
        });
      }
    } else if (method === 'Network.loadingFailed') {
       this.pendingRequests.delete(requestId);
    }
  }
}

const debuggerManager = new DebuggerManager();

chrome.debugger.onEvent.addListener(debuggerManager.handleEvent.bind(debuggerManager));
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId && debuggerManager.attachedTabIds.has(source.tabId)) {
    debuggerManager.attachedTabIds.delete(source.tabId);
  }
});

// Auto-attach/detach when tab URL updates (e.g. navigation)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (settings.capture.enabled) {
    if (debuggerManager.trackedTabIds.has(tabId)) {
      const urlToCheck = changeInfo.url || tab.url;
      if (urlToCheck) {
        if (isUrlInScope(urlToCheck)) {
          await debuggerManager.attachToTab(tabId);
        } else {
          await debuggerManager.detach(tabId);
        }
      }
    }
  }
});

// Auto-attach to newly created tabs if they were spawned from a tracked tab (e.g. clicked links)
chrome.tabs.onCreated.addListener(async (tab) => {
  if (settings.capture.enabled && tab.id) {
    if (tab.openerTabId && debuggerManager.trackedTabIds.has(tab.openerTabId)) {
      debuggerManager.trackTab(tab.id);
      if (tab.url && isUrlInScope(tab.url)) {
        await debuggerManager.attachToTab(tab.id);
      }
    }
  }
});

// Remove the global query on load so it doesn't arbitrarily attach to the active tab if it wasn't the target.

function normalizeJsUrl(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    const url = new URL(urlStr);
    url.search = '';
    url.hash = '';
    let pathname = url.pathname;
    pathname = pathname.replace(/[.-][a-zA-Z0-9_-]{6,30}(?=\.js$)/, '');
    return url.origin + pathname;
  } catch {
    return String(urlStr).split('?')[0];
  }
}
function parseRawHTTPRequest(raw: string): { url: string; method: string; headers: Record<string, string>; body?: string } {
  const lines = raw.trim().split(/\r?\n/);
  const [requestLine, ...headerAndBodyLines] = lines;
  const [method, pathAndProtocol] = (requestLine || 'GET /').trim().split(/\s+/);
  
  let headerEndIndex = headerAndBodyLines.indexOf('');
  if (headerEndIndex === -1) {
    headerEndIndex = headerAndBodyLines.length;
  }
  
  const headers: Record<string, string> = {};
  for (let i = 0; i < headerEndIndex; i++) {
    const line = headerAndBodyLines[i].trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    if (colonIdx !== -1) {
      const name = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      headers[name] = value;
    }
  }
  
  const body = headerAndBodyLines.slice(headerEndIndex + 1).join('\n').trim();
  
  let path = pathAndProtocol || '/';
  const spaceIdx = path.indexOf(' ');
  if (spaceIdx !== -1) {
    path = path.substring(0, spaceIdx);
  }
  
  let url = path;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    const host = headers['Host'] || headers['host'] || 'localhost';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    url = `${protocol}://${host}${path}`;
  }
  
  return {
    url,
    method: method || 'GET',
    headers,
    body: body || undefined
  };
}

// ---- Message Handling ----
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, sender, sendResponse) => {
    if (message.type === 'SEND_TO_REPEATER') {
      const tab = sender.tab;
      if (tab?.windowId && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
          console.warn('[BrowseLens] Failed to open sidepanel via message:', err);
        });
      }
    }
    handleMessage(message, sendResponse, sender);
    return true; // Keep message channel open for async responses
  }
);

async function handleMessage(
  message: ExtensionMessage,
  sendResponse: (response: unknown) => void,
  sender?: chrome.runtime.MessageSender
) {
  await ensureInit();
  switch (message.type) {
    case 'DEVTOOLS_REQUEST_CAPTURED':
    case 'REQUEST_CAPTURED': {
      // Ignore content script captures from tabs other than our explicitly tracked ones
      if (sender && sender.tab && sender.tab.id !== undefined) {
        if (!debuggerManager.attachedTabIds.has(sender.tab.id)) {
          sendResponse({ success: false, reason: 'not target tab' });
          return;
        }
      }

      const request = message.payload as CapturedRequest;
      logDebug(`REQUEST_CAPTURED received - id: ${request.id}, url: ${request.url ? request.url.substring(0, 60) : 'none'}`);
      if (!request || !request.url) {
        sendResponse({ success: false, reason: 'invalid request payload' });
        return;
      }

      // 1. Optimize stored payloads by discarding response bodies for heavy/non-essential MIME types
      const mime = (request.mimeType || '').toLowerCase();
      const url = (request.url || '').toLowerCase();
      
      const isHeavyAsset = 
        mime.startsWith('image/') || 
        mime.startsWith('video/') || 
        mime.startsWith('audio/') || 
        mime.startsWith('font/') ||
        mime.includes('css') ||
        url.endsWith('.png') || 
        url.endsWith('.jpg') || 
        url.endsWith('.jpeg') || 
        url.endsWith('.gif') || 
        url.endsWith('.webp') || 
        url.endsWith('.svg') || 
        url.endsWith('.css') || 
        url.endsWith('.woff') || 
        url.endsWith('.woff2') || 
        url.endsWith('.ttf');

      if (isHeavyAsset && request.responseBody) {
        request.responseBody = `[Response body discarded for static assets: ${mime || 'asset'}]`;
        request.responseBodySize = 0;
      }

      // 1b. Resilient Audit History: Auto-populate empty JS body if the same URL was already audited in the active project
      const isJsAsset = url.endsWith('.js') || url.includes('.js?') || mime.includes('javascript') || mime.includes('x-javascript');
      if (isJsAsset && (!request.responseBody || request.responseBody.startsWith('[Response body discarded'))) {
        const normUrl = normalizeJsUrl(request.url);
        const existingAudit = capturedRequests.find(r => 
          normalizeJsUrl(r.url) === normUrl && 
          r.responseBody && 
          !r.responseBody.startsWith('[Response body discarded')
        );
        if (existingAudit) {
          request.responseBody = existingAudit.responseBody;
          request.responseBodySize = existingAudit.responseBodySize;
          logDebug(`Audit History auto-populated JS body from matching URL: ${request.url}`);
        }
      }

      // 2. Limit the stored response/request body size to max 150 KB to prevent Chrome storage serialization failures
      const MAX_BODY_SIZE = 150 * 1024; // 150 KB
      if (request.responseBody && request.responseBody.length > MAX_BODY_SIZE) {
        request.responseBody = request.responseBody.substring(0, MAX_BODY_SIZE) + '\n\n[... Response Body Truncated (Exceeds 150KB Limit) ...]';
        request.responseBodySize = request.responseBody.length;
      }
      // Apply storage-safe truncation (≤8KB) to both bodies
      if (request.responseBody) {
        request.responseBody = safeTruncate(request.responseBody);
        logDebug(`Response body after safeTruncate length: ${request.responseBody?.length || 0}`);
      }
      if (request.requestBody) {
        request.requestBody = safeTruncate(request.requestBody);
        logDebug(`Request body after safeTruncate length: ${request.requestBody?.length || 0}`);
      }
      if (request.requestBody && request.requestBody.length > MAX_BODY_SIZE) {
        request.requestBody = request.requestBody.substring(0, MAX_BODY_SIZE) + '\n\n[... Request Body Truncated (Exceeds 150KB Limit) ...]';
        request.requestBodySize = request.requestBody.length;
      }
      
      // Check filter settings
      console.log('[BrowseLens] REQUEST_CAPTURED handler: capture.enabled=', settings.capture?.enabled, 'url=', request.url?.substring(0, 80));
      if (!settings.capture.enabled) {
        logDebug(`REQUEST_CAPTURED rejected - capture disabled`);
        console.warn('[BrowseLens] REJECTED - capture disabled');
        sendResponse({ success: false, reason: 'capture disabled' });
        return;
      }

      // Check Target Scope for active project
      const activeProject = getActiveProject();
      console.log('[BrowseLens] activeProject.targetScope=', JSON.stringify(activeProject.targetScope));
      if (activeProject.targetScope && activeProject.targetScope.trim() !== '') {
        const scopes = activeProject.targetScope.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        const reqUrl = (request.url || '').toLowerCase();
        // Extract hostname from URL for precise matching
        let hostname = '';
        try {
          hostname = new URL(reqUrl).hostname;
        } catch (_) {
          // Fallback to raw URL if parsing fails
          hostname = reqUrl;
        }
        let inScope = false;

        for (const scope of scopes) {
          const cleanScope = scope.startsWith('*.') ? scope.slice(2) : scope;
          if (hostname === cleanScope || hostname.endsWith(`.${cleanScope}`)) {
            inScope = true;
            break;
          }
        }

        if (!inScope) {
          logDebug(`REQUEST_CAPTURED rejected - out of scope: ${reqUrl} (hostname: ${hostname})`);
          console.warn('[BrowseLens] REJECTED out of scope. scopes=', scopes, 'url=', reqUrl, 'hostname=', hostname);
          sendResponse({ success: false, reason: 'out of scope' });
          return;
        }
      }

      // Check Exclude Scope for active project
      if (activeProject.excludeScope && activeProject.excludeScope.trim() !== '') {
        const excludes = activeProject.excludeScope.split(',').map(s => s.trim()).filter(Boolean);
        const reqUrl = (request.url || '').toLowerCase();
        let hostname = '';
        try {
          hostname = new URL(reqUrl).hostname;
        } catch (_) {
          hostname = reqUrl;
        }
        
        let excluded = false;
        for (const item of excludes) {
          const lowerItem = item.toLowerCase();
          
          // Regex Match (e.g. /activeview|worklet/i or /activeview|worklet/)
          if (item.startsWith('/') && item.lastIndexOf('/') > 0) {
            try {
              const lastSlashIdx = item.lastIndexOf('/');
              const pattern = item.slice(1, lastSlashIdx);
              const flags = item.slice(lastSlashIdx + 1);
              const regex = new RegExp(pattern, flags.includes('i') ? 'i' : '');
              if (regex.test(request.url)) {
                excluded = true;
                break;
              }
            } catch (err) {
              console.error('[BrowseLens] Exclude scope regex failed to compile:', item, err);
            }
          }
          // Wildcard Subdomains Match (e.g., "*.doubleclick.net")
          else if (lowerItem.startsWith('*.')) {
            const base = lowerItem.slice(2);
            if (hostname === base || hostname.endsWith(`.${base}`)) {
              excluded = true;
              break;
            }
          } 
          // Substring / Exact Host Match
          else {
            if (hostname.includes(lowerItem) || reqUrl.includes(lowerItem)) {
              excluded = true;
              break;
            }
          }
        }

        if (excluded) {
          logDebug(`REQUEST_CAPTURED rejected - matched exclude scope: ${reqUrl}`);
          console.warn('[BrowseLens] REJECTED - matched exclude scope. excludes=', excludes, 'url=', reqUrl);
          sendResponse({ success: false, reason: 'excluded scope' });
          return;
        }
      }

      // Deduplicate and Merge (by ID OR by Method + URL + Closeness + RequestBody)
      let mergedRequest = request;
      let existingIdx = capturedRequests.findIndex(r => r.id === request.id);
      
      if (existingIdx === -1) {
        // Try to match by Method + URL + Timestamp closeness + stripped RequestBody match
        existingIdx = capturedRequests.findIndex(r => {
          const sameMethod = r.method === request.method;
          const sameUrl = r.url === request.url;
          const closeTime = Math.abs((r.timestamp || 0) - (request.timestamp || 0)) < 5000;
          
          if (!sameMethod || !sameUrl || !closeTime) return false;
          
          // If request body is present in either, compare stripped content to prevent accidental POST merges
          const rBodyClean = r.requestBody ? r.requestBody.replace(/\s+/g, '') : '';
          const reqBodyClean = request.requestBody ? request.requestBody.replace(/\s+/g, '') : '';
          if (rBodyClean || reqBodyClean) {
            return rBodyClean === reqBodyClean;
          }
          
          return true;
        });
      }

      if (existingIdx >= 0) {
        // Merge properties securely
        const target = { ...capturedRequests[existingIdx] };
        
        // Preserve responseBody if incoming has it
        if (request.responseBody && (!target.responseBody || target.responseBody.startsWith('[Response body discarded') || target.responseBody === '[Could not read response body]')) {
          target.responseBody = request.responseBody;
          target.responseBodySize = request.responseBodySize;
        }
        
        // Preserve requestBody if incoming has it
        if (request.requestBody && (!target.requestBody || target.requestBody.startsWith('[Request body discarded'))) {
          target.requestBody = request.requestBody;
          target.requestBodySize = request.requestBodySize;
        }

        // Merge headers (keep whichever has more headers)
        if (request.requestHeaders && Object.keys(request.requestHeaders).length > (target.requestHeaders ? Object.keys(target.requestHeaders).length : 0)) {
          target.requestHeaders = { ...target.requestHeaders, ...request.requestHeaders };
        }
        if (request.responseHeaders && Object.keys(request.responseHeaders).length > (target.responseHeaders ? Object.keys(target.responseHeaders).length : 0)) {
          target.responseHeaders = { ...target.responseHeaders, ...request.responseHeaders };
        }

        // Merge status and other fields
        if (request.status && !target.status) target.status = request.status;
        if (request.statusText && !target.statusText) target.statusText = request.statusText;
        if (request.duration && !target.duration) target.duration = request.duration;
        if (request.mimeType && !target.mimeType) target.mimeType = request.mimeType;

        capturedRequests[existingIdx] = target;
        mergedRequest = target;
      } else {
        capturedRequests.push(request);
      }

      // Run passive scanner
      try {
        mergedRequest.vulnerabilities = runPassiveScan(mergedRequest);
      } catch (err) {
        console.error('[BrowseLens] Passive scan failed:', err);
      }

      // Keep max request history based on settings
      const historyLimit = settings.capture.maxHistoryLimit || 1000;
      if (capturedRequests.length > historyLimit) {
        const projId = settings.currentProjectId || 'default';
        const removed = capturedRequests.slice(0, capturedRequests.length - historyLimit);
        capturedRequests = capturedRequests.slice(-historyLimit);
        
        // Clean up old rows from storage in background
        const keysToDelete = removed.map(r => `request_${projId}_${r.id}`);
        chrome.storage.local.remove(keysToDelete).catch(() => {});
      }

      await saveSingleRequest(mergedRequest);
        // Debug log to verify responseBody storage
        console.log('[BrowseLens] Stored request', mergedRequest.id, 'responseBody length:', mergedRequest.responseBody?.length);


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
        await saveSingleRequest(req);
        // Broadcast update to side panels
        chrome.runtime.sendMessage({
          type: 'REQUEST_CAPTURED',
          payload: req,
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
    }

    case 'UPDATE_REQUEST_NOTES': {
      const { id, notes } = message.payload as { id: string; notes: string };
      const req = capturedRequests.find(r => r.id === id);
      if (req) {
        req.notes = notes;
        await saveSingleRequest(req);
        // Broadcast update to side panels
        chrome.runtime.sendMessage({
          type: 'REQUEST_CAPTURED',
          payload: req,
        }).catch(() => {});
      }
      sendResponse({ success: true });
      break;
    }

    case 'UPDATE_REQUEST_BODY': {
      const { id, responseBody } = message.payload as { id: string; responseBody: string };
      const req = capturedRequests.find(r => r.id === id);
      if (req) {
        req.responseBody = responseBody;
        req.responseBodySize = responseBody.length;
        await saveSingleRequest(req);
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
      await saveRequests();
      sendResponse({ success: true });
      break;
    }

    case 'CLEAR_REQUESTS': {
      const projId = settings.currentProjectId || 'default';
      const indexKey = `requests_index_${projId}`;
      const storedIndex = await chrome.storage.local.get(indexKey);
      const index = (storedIndex[indexKey] || []) as string[];
      
      const keysToDelete = index.map(id => `request_${projId}_${id}`);
      keysToDelete.push(indexKey);
      
      await chrome.storage.local.remove(keysToDelete);
      capturedRequests = [];
      sendResponse({ success: true });
      break;
    }

    case 'DELETE_REQUEST': {
      const { id } = message.payload as { id: string };
      const projId = settings.currentProjectId || 'default';
      const indexKey = `requests_index_${projId}`;
      const requestKey = `request_${projId}_${id}`;
      
      capturedRequests = capturedRequests.filter(r => r.id !== id);
      const index = capturedRequests.map(r => r.id);
      await chrome.storage.local.remove(requestKey);
      await chrome.storage.local.set({ [indexKey]: index });
      
      // Broadcast deletion to side panels
      chrome.runtime.sendMessage({
        type: 'REQUEST_DELETED',
        payload: { id }
      }).catch(() => {});
      
      sendResponse({ success: true });
      break;
    }

    case 'DELETE_FILTERED_REQUESTS': {
      const { ids } = message.payload as { ids: string[] };
      const projId = settings.currentProjectId || 'default';
      const indexKey = `requests_index_${projId}`;
      
      capturedRequests = capturedRequests.filter(r => !ids.includes(r.id));
      const requestKeys = ids.map(id => `request_${projId}_${id}`);
      const index = capturedRequests.map(r => r.id);
      await chrome.storage.local.remove(requestKeys);
      await chrome.storage.local.set({ [indexKey]: index });
      
      // Broadcast deletion to side panels
      chrome.runtime.sendMessage({
        type: 'FILTERED_REQUESTS_DELETED',
        payload: { ids }
      }).catch(() => {});
      
      sendResponse({ success: true });
      break;
    }

    case 'EXECUTE_RAW_HTTP': {
      const { rawRequest } = message.payload as { rawRequest: string };
      try {
        const parsed = parseRawHTTPRequest(rawRequest);
        const startTime = Date.now();
        const response = await fetch(parsed.url, {
          method: parsed.method,
          headers: parsed.headers,
          body: parsed.body || undefined,
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
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          duration,
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
      const { message: userMsg, history } = message.payload as { message: string; history?: ChatEntry[] };

      try {
        const agent = new AIAgent(settings, capturedRequests, {
          onToolCall: (toolCall) => {
            chrome.runtime.sendMessage({
              type: 'AI_TOOL_CALL',
              payload: toolCall,
            }).catch(() => {});
          },
        });

        const currentHistory = history || [];
        const result = await agent.chat(userMsg, currentHistory);

        // Sync background global chatHistory for fallback/debug purposes
        chatHistory = [...currentHistory, {
          role: 'user',
          content: userMsg,
          timestamp: Date.now(),
        }, {
          role: 'assistant',
          content: result.content,
          toolCalls: result.toolCalls,
          timestamp: Date.now(),
          usage: result.usage,
        }];

        if (chatHistory.length > 100) {
          chatHistory = chatHistory.slice(-100);
        }

        sendResponse({
          success: true,
          content: result.content,
          toolCalls: result.toolCalls,
          usage: result.usage,
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
      const oldEnabled = settings?.capture?.enabled;
      settings = message.payload as ExtensionSettings;
      await chrome.storage.local.set({ settings });
      try {
        await updateHeaderRules();
      } catch (err) {
        console.error('[BrowseLens] Failed to update header rules on save settings:', err);
      }
      
      // Handle debugger state
      if (!settings.capture.enabled && oldEnabled) {
        debuggerManager.untrackAll();
      }

      sendResponse({ success: true });
      break;
    }

    case 'ATTACH_TO_TAB': {
      const { tabId } = message.payload as { tabId: number };
      if (settings.capture.enabled) {
        debuggerManager.trackTab(tabId);
        chrome.tabs.get(tabId, (tab) => {
          if (tab && tab.url && isUrlInScope(tab.url)) {
            debuggerManager.attachToTab(tabId);
          }
        });
      }
      sendResponse({ success: true });
      break;
    }

    case 'SWITCH_PROJECT': {
      const { projectId } = message.payload as { projectId: string };
      const isProjectChanged = settings.currentProjectId !== projectId;
      
      settings.currentProjectId = projectId;
      await chrome.storage.local.set({ settings });
      
      // Load the new requests partition only if the project actually changed
      if (isProjectChanged || capturedRequests.length === 0) {
        await loadRequests();
      }
      
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

// Define session rules to strip frame restrictions for our local iframe
async function setupDeclarativeRules() {
  try {
    const rules: chrome.declarativeNetRequest.Rule[] = [
      {
        id: 101,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          responseHeaders: [
            {
              header: "x-frame-options",
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE
            },
            {
              header: "content-security-policy",
              operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE
            }
          ]
        },
        condition: {
          initiatorDomains: [chrome.runtime.id],
          resourceTypes: [
            chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST
          ]
        }
      }
    ];

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [101],
      addRules: rules
    });
    logDebug('[BrowseLens] DNR Header Stripping Session Rules initialized.');
  } catch (err) {
    console.error('[BrowseLens] Failed to initialize DNR Header Stripping:', err);
  }
}

// ---- Context Menus for Selected Text ----
chrome.runtime.onInstalled.addListener(() => {
  setupDeclarativeRules().catch(console.error);

  // Clear any existing menus to avoid duplicate ID errors
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "browse-lens-parent",
      title: "🔍 BrowseLens Tools",
      contexts: ["selection", "link"]
    });

    chrome.contextMenus.create({
      parentId: "browse-lens-parent",
      id: "open-minibrowser",
      title: "🌐 Open in Mini Browser",
      contexts: ["selection", "link"]
    });

    chrome.contextMenus.create({
      parentId: "browse-lens-parent",
      id: "decode-base64",
      title: "🔓 Decode Base64",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      parentId: "browse-lens-parent",
      id: "encode-base64",
      title: "🔢 Encode Base64",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      parentId: "browse-lens-parent",
      id: "decode-jwt",
      title: "🔑 Decode JWT Token",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      parentId: "browse-lens-parent",
      id: "ask-ai",
      title: "🪄 Ask AI Assistant",
      contexts: ["selection"]
    });
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupDeclarativeRules().catch(console.error);
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = info.selectionText || info.linkUrl;
  if (!selectedText) return;

  if (info.menuItemId === "open-minibrowser") {
    // Inject floating minibrowser modal in the target active tab
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: "INJECT_MINIBROWSER_MODAL",
        url: selectedText
      }).catch((err) => {
        console.warn('[BrowseLens] Failed to send message to inject minibrowser modal:', err);
      });
    }
    return;
  }

  // 1. Save action payload to storage so the sidepanel can pick it up on mount/load
  await chrome.storage.local.set({
    pending_tool_action: {
      type: info.menuItemId,
      text: selectedText,
      timestamp: Date.now()
    }
  });

  // 2. Programmatically open SidePanel if supported (MV3)
  if (tab?.windowId && chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((err) => {
      console.warn('[BrowseLens] Failed to open side panel via script:', err);
    });
  }

  // 3. Broadcast immediately in case SidePanel is already open and active
  if (info.menuItemId === "decode-base64") {
    chrome.runtime.sendMessage({
      type: "TRIGGER_BASE64_DECODE",
      payload: { text: selectedText }
    }).catch(() => {});
  } else if (info.menuItemId === "encode-base64") {
    chrome.runtime.sendMessage({
      type: "TRIGGER_BASE64_ENCODE",
      payload: { text: selectedText }
    }).catch(() => {});
  } else if (info.menuItemId === "decode-jwt") {
    chrome.runtime.sendMessage({
      type: "TRIGGER_JWT_DECODE",
      payload: { text: selectedText }
    }).catch(() => {});
  } else if (info.menuItemId === "ask-ai") {
    chrome.runtime.sendMessage({
      type: "TRIGGER_ASK_AI",
      payload: { prompt: `Analyze and explain this string selected from the web page:\n\n"${selectedText}"` }
    }).catch(() => {});
  }
});

