// ============================================================
// BrowseLens — DevTools Network Capture
// Uses chrome.devtools.network API to capture HTTP requests
// with full response body (only works when DevTools is open).
// ============================================================

import type { CapturedRequest } from '../shared/types';

let requestCounter = 0;

// Listen for completed network requests
chrome.devtools.network.onRequestFinished.addListener(
  (request: chrome.devtools.network.Request) => {
    const entry = request as chrome.devtools.network.Request;
    const har = entry.request;
    const harResponse = entry.response;

    // Build captured request object
    const capturedRequest: CapturedRequest = {
      id: `dt-${Date.now()}-${requestCounter++}`,
      timestamp: Date.now(),
      tabId: chrome.devtools.inspectedWindow.tabId,
      source: 'devtools',
      method: har.method,
      url: har.url,
      requestHeaders: {},
      requestBody: undefined,
      status: harResponse.status,
      statusText: harResponse.statusText,
      responseHeaders: {},
      mimeType: harResponse.content?.mimeType || '',
      duration: entry.time || undefined,
    };

    // Parse request headers
    for (const header of har.headers) {
      capturedRequest.requestHeaders[header.name] = header.value;
    }

    // Parse request body (POST data)
    if (har.postData) {
      capturedRequest.requestBody = har.postData.text || '';
      capturedRequest.requestBodySize = har.postData.text?.length || 0;
    }

    // Parse response headers
    for (const header of harResponse.headers) {
      capturedRequest.responseHeaders![header.name] = header.value;
    }

    // Get response body content
    entry.getContent((content: string, encoding: string) => {
      if (content) {
        capturedRequest.responseBody = encoding === 'base64'
          ? `[Base64 encoded content, ${content.length} chars]`
          : content;
        capturedRequest.responseBodySize = content.length;
      }

      // Send to service worker
      chrome.runtime.sendMessage({
        type: 'DEVTOOLS_REQUEST_CAPTURED',
        payload: capturedRequest,
      }).catch((err: Error) => {
        console.error('[BrowseLens DevTools] Failed to send request:', err);
      });
    });
  }
);

console.log('[BrowseLens] DevTools network capture initialized');
