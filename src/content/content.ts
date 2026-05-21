// ============================================================
// BrowseLens — Content Script (Main World)
// Monkey-patches fetch() and XMLHttpRequest to capture
// HTTP requests even when DevTools is NOT open.
// ============================================================

(function () {
  // Avoid double-patching
  if ((window as unknown as Record<string, boolean>).__browselens_patched) return;
  (window as unknown as Record<string, boolean>).__browselens_patched = true;

  let counter = 0;

  function generateId(): string {
    return `cs-${Date.now()}-${counter++}`;
  }

  function sendToExtension(data: unknown) {
    window.postMessage(
      { source: 'browselens-content', payload: data },
      '*'
    );
  }

  // ---- Patch fetch() ----
  const originalFetch = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const [input, init] = args;
    const id = generateId();
    let method = 'GET';
    let url = '';
    const requestHeaders: Record<string, string> = {};
    let requestBody: string | undefined;

    if (typeof input === 'string' || input instanceof URL) {
      url = input.toString();
      method = init?.method?.toUpperCase() || 'GET';
      
      if (init?.headers) {
        const h = new Headers(init.headers);
        h.forEach((value, key) => {
          requestHeaders[key] = value;
        });
      }

      if (init?.body) {
        if (typeof init.body === 'string') {
          requestBody = init.body;
        } else {
          try {
            requestBody = JSON.stringify(init.body);
          } catch {
            requestBody = '[non-serializable body]';
          }
        }
      }
    } else {
      // It's a Request object
      const req = input as Request;
      url = req.url;
      method = req.method.toUpperCase();
      
      req.headers.forEach((value, key) => {
        requestHeaders[key] = value;
      });

      // We cannot easily synchronously read the body of a Request object without consuming it.
      // But we can check if it was provided in init (if overriding).
      if (init?.body) {
        if (typeof init.body === 'string') {
          requestBody = init.body;
        } else {
          try {
            requestBody = JSON.stringify(init.body);
          } catch {
            requestBody = '[non-serializable body]';
          }
        }
      }
    }
    
    const startTime = Date.now();

    try {
      const response = await originalFetch.apply(this, args);
      const duration = Date.now() - startTime;

      // Clone response so we can read body without consuming it
      const cloned = response.clone();

      // Capture response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Read response body (async, non-blocking)
      cloned.text().then(body => {
        sendToExtension({
          id,
          timestamp: startTime,
          source: 'content-script',
          method,
          url,
          requestHeaders,
          requestBody,
          status: response.status,
          statusText: response.statusText,
          responseHeaders,
          responseBody: (body && body.length > 0) ? (body.length > 50000 ? body.substring(0, 50000) + '...[truncated]' : body) : '[empty body]',
          responseBodySize: body.length,
          mimeType: response.headers.get('content-type') || '',
          duration,
        });
      }).catch(() => {
        sendToExtension({
          id,
          timestamp: startTime,
          source: 'content-script',
          method,
          url,
          requestHeaders,
          requestBody,
          status: response.status,
          statusText: response.statusText,
          responseHeaders,
          responseBody: '[error reading body]',
          responseBodySize: 0,
          mimeType: response.headers.get('content-type') || '',
          duration,
        });
      });

      return response;
    } catch (err) {
      throw err;
    }
  };

  // ---- Patch XMLHttpRequest ----
  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  const originalSetRequestHeader = XHR.setRequestHeader;

  XHR.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as unknown as Record<string, unknown>).__bl_method = method;
    (this as unknown as Record<string, unknown>).__bl_url = typeof url === 'string' ? url : url.toString();
    (this as unknown as Record<string, unknown>).__bl_headers = {};
    (this as unknown as Record<string, unknown>).__bl_id = generateId();
    (this as unknown as Record<string, unknown>).__bl_start = Date.now();
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<typeof originalOpen>);
  };

  XHR.setRequestHeader = function (name: string, value: string) {
    const headers = (this as unknown as Record<string, Record<string, string>>).__bl_headers;
    if (headers) {
      headers[name] = value;
    }
    return originalSetRequestHeader.apply(this, [name, value]);
  };

  XHR.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const xhr = this as unknown as Record<string, unknown>;

    this.addEventListener('load', function () {
      const duration = Date.now() - (xhr.__bl_start as number);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      const rawHeaders = (this as XMLHttpRequest).getAllResponseHeaders();
      rawHeaders.split('\r\n').forEach(line => {
        const [key, ...valueParts] = line.split(': ');
        if (key) responseHeaders[key] = valueParts.join(': ');
      });

      sendToExtension({
        id: xhr.__bl_id,
        timestamp: xhr.__bl_start,
        source: 'content-script',
        method: xhr.__bl_method,
        url: xhr.__bl_url,
        requestHeaders: xhr.__bl_headers,
        requestBody: typeof body === 'string' ? body : undefined,
        status: (this as XMLHttpRequest).status,
        statusText: (this as XMLHttpRequest).statusText,
        responseHeaders,
        responseBody: (function(xhrObj) {
          try {
            const rt = xhrObj.responseType;
            const resp = xhrObj.response;
            if (rt === 'json' || (resp && typeof resp === 'object')) {
              return JSON.stringify(resp).substring(0, 50000);
            }
            if (typeof resp === 'string') {
              return resp.substring(0, 50000);
            }
            if (typeof xhrObj.responseText === 'string') {
              return xhrObj.responseText.substring(0, 50000);
            }
          } catch (_) {}
          return undefined;
        })(this as XMLHttpRequest),
        responseBodySize: (function(xhrObj) {
          try {
            const rt = xhrObj.responseType;
            const resp = xhrObj.response;
            if (rt === 'json' || (resp && typeof resp === 'object')) {
              return JSON.stringify(resp).length;
            }
            if (typeof resp === 'string') {
              return resp.length;
            }
            if (typeof xhrObj.responseText === 'string') {
              return xhrObj.responseText.length;
            }
          } catch (_) {}
          return undefined;
        })(this as XMLHttpRequest),
        mimeType: (this as XMLHttpRequest).getResponseHeader('content-type') || '',
        duration,
      });
    });

    return originalSend.apply(this, [body] as unknown as Parameters<typeof originalSend>);
  };

  console.log('[BrowseLens] Content script: fetch/XHR capture initialized');
})();
