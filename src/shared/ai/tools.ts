// ============================================================
// BrowseLens — AI Tool Definitions
// These tools are provided to the LLM so it can perform
// pentesting actions autonomously via function calling.
// ============================================================

import type { CapturedRequest } from '../types';

/** OpenAI-compatible tool definition schema */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        items?: { type: string };
      }>;
      required?: string[];
    };
  };
}

/** All available tools for the AI agent */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_captured_requests',
      description: 'Get a list of all captured HTTP requests from the browser. You can optionally filter by URL pattern, HTTP method, or status code. Returns a summary list with id, method, url, status, and duration.',
      parameters: {
        type: 'object',
        properties: {
          url_pattern: {
            type: 'string',
            description: 'Optional regex or substring to filter requests by URL',
          },
          method: {
            type: 'string',
            description: 'Optional HTTP method filter (GET, POST, PUT, DELETE, etc.)',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
          },
          status: {
            type: 'string',
            description: 'Optional status code filter. Can be exact (200) or range (4xx, 5xx)',
          },
          limit: {
            type: 'string',
            description: 'Maximum number of requests to return. Default: 50',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_request_detail',
      description: 'Get full details of a specific captured HTTP request including all headers, request body, response headers, and response body.',
      parameters: {
        type: 'object',
        properties: {
          request_id: {
            type: 'string',
            description: 'The unique ID of the captured request to inspect',
          },
        },
        required: ['request_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_http_request',
      description: 'Send a new HTTP request (like a repeater/replayer). Use this to test endpoints with modified parameters, headers, or body content. Returns the full response including status, headers, and body.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The full URL to send the request to',
          },
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
            enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
          },
          headers: {
            type: 'string',
            description: 'JSON string of headers to include. Example: {"Authorization": "Bearer xxx", "Content-Type": "application/json"}',
          },
          body: {
            type: 'string',
            description: 'Request body (for POST/PUT/PATCH). Can be JSON string, form data, etc.',
          },
        },
        required: ['url', 'method'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_in_requests',
      description: 'Search for a specific pattern or string across all captured requests. Searches in URLs, headers, request bodies, and response bodies. Useful for finding tokens, API keys, sensitive data, or specific patterns.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The search pattern (string or regex) to look for',
          },
          scope: {
            type: 'string',
            description: 'Where to search: url, request_headers, request_body, response_headers, response_body, or all',
            enum: ['url', 'request_headers', 'request_body', 'response_headers', 'response_body', 'all'],
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_security_headers',
      description: 'Analyze the security headers of a specific HTTP response. Checks for missing or misconfigured headers like CSP, X-Frame-Options, HSTS, X-Content-Type-Options, etc.',
      parameters: {
        type: 'object',
        properties: {
          request_id: {
            type: 'string',
            description: 'The ID of the captured request whose response headers should be analyzed',
          },
        },
        required: ['request_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_to_memory',
      description: 'Save an observation, heuristic, finding, or lesson learned to the Long-Term Memory (RAG Qdrant). Use this when you identify a persistent security insight about a target that should be remembered across sessions.',
      parameters: {
        type: 'object',
        properties: {
          knowledge_type: {
            type: 'string',
            description: 'Type of knowledge',
            enum: ['observation', 'heuristic', 'finding', 'lesson_learned'],
          },
          content: {
            type: 'string',
            description: 'The actual insight/knowledge text (e.g. "Target example.com uses predictable auto-incrementing integers for user IDs in /api/profile endpoint")',
          },
          target_domain: {
            type: 'string',
            description: 'The domain this applies to. Leave empty if it is a global heuristic.',
          },
          related_endpoints: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of relevant URL endpoints',
          }
        },
        required: ['knowledge_type', 'content'],
      },
    },
  },
];

// ============================================================
// Tool Execution Functions
// ============================================================
// Hash function removed, using real shortId from CapturedRequest

function cleanPentestPayload(content: string, mimeType?: string): string {
  if (!content) return content;
  let cleaned = content;
  // Strip large data URIs
  cleaned = cleaned.replace(/data:[a-zA-Z0-9/+-]+;base64,[A-Za-z0-9+/=]{100,}/g, 'data:...[TRUNCATED_B64_URI]');
  // Strip massive continuous strings (likely minified maps, huge JWTs/keys, etc)
  cleaned = cleaned.replace(/[A-Za-z0-9+/=]{1000,}/g, '[TRUNCATED_LONG_STRING]');
  // Strip HTML specific bloat
  if (mimeType?.includes('html') || mimeType?.includes('xml') || cleaned.includes('<html')) {
    cleaned = cleaned.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '<svg>[TRUNCATED_SVG]</svg>');
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '<style>[TRUNCATED_CSS]</style>');
  }
  return cleaned;
}

function safeTruncate(val: any, limit: number = 1500, mimeType?: string): string | null {
  if (!val) return null;
  let str = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
  str = cleanPentestPayload(str, mimeType);
  if (str.length > limit) {
    return str.substring(0, limit) + `\n... [truncated ${str.length - limit} chars]`;
  }
  return str;
}

/** Execute get_captured_requests tool */
export function executeGetCapturedRequests(
  requests: CapturedRequest[],
  args: { url_pattern?: string; method?: string; status?: string; limit?: string }
): string {
  let filtered = [...requests];

  if (args.url_pattern) {
    try {
      const regex = new RegExp(args.url_pattern, 'i');
      filtered = filtered.filter(r => regex.test(r.url));
    } catch {
      filtered = filtered.filter(r => r.url.includes(args.url_pattern!));
    }
  }

  if (args.method) {
    filtered = filtered.filter(r => r.method.toUpperCase() === args.method!.toUpperCase());
  }

  if (args.status) {
    if (args.status.includes('x')) {
      const prefix = args.status.charAt(0);
      filtered = filtered.filter(r => String(r.status).charAt(0) === prefix);
    } else {
      filtered = filtered.filter(r => r.status === parseInt(args.status!));
    }
  }

  const limit = parseInt(args.limit || '15');
  filtered = filtered.slice(-limit);

  const summary = filtered.map(r => ({
    id: r.id,
    shortId: r.shortId,
    method: r.method,
    url: r.url.length > 150 ? r.url.substring(0, 150) + '...' : r.url,
    status: r.status,
    duration: r.duration ? `${r.duration}ms` : 'N/A',
    mimeType: r.mimeType,
  }));

  return JSON.stringify(summary, null, 2);
}

/** Execute get_request_detail tool */
export function executeGetRequestDetail(
  requests: CapturedRequest[],
  args: { request_id: string },
  limit: number = 1500
): string {
  let cleanId = args.request_id.trim();
  if (!cleanId.startsWith('dbg-')) {
    const match = cleanId.match(/(\d+)/);
    if (match) cleanId = match[1];
  }
  const req = requests.find(r => r.id === cleanId || r.shortId === cleanId || r.id === args.request_id);
  if (!req) return JSON.stringify({ error: `Request ${args.request_id} not found` });

  return JSON.stringify({
    id: req.id,
    method: req.method,
    url: req.url,
    timestamp: new Date(req.timestamp).toISOString(),
    requestHeaders: safeTruncate(req.requestHeaders, limit),
    requestBody: safeTruncate(req.requestBody, limit, req.mimeType),
    status: req.status,
    statusText: req.statusText,
    responseHeaders: safeTruncate(req.responseHeaders, limit),
    responseBody: safeTruncate(req.responseBody, limit, req.mimeType),
    duration: req.duration,
    mimeType: req.mimeType,
  }, null, 2);
}

/** Execute search_in_requests tool */
export function executeSearchInRequests(
  requests: CapturedRequest[],
  args: { pattern: string; scope?: string }
): string {
  const scope = args.scope || 'all';
  const results: Array<{ request_id: string; url: string; matches_in: string[]; snippet: string }> = [];

  let regex: RegExp;
  try {
    regex = new RegExp(args.pattern, 'gi');
  } catch {
    regex = new RegExp(args.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  }

  for (const req of requests) {
    regex.lastIndex = 0; // Reset RegExp state for each request to avoid state-retention bugs!
    const matchLocations: string[] = [];
    let snippet = '';

    if ((scope === 'all' || scope === 'url') && regex.test(req.url)) {
      matchLocations.push('url');
      snippet = req.url;
      regex.lastIndex = 0;
    }
    if ((scope === 'all' || scope === 'request_headers') && regex.test(JSON.stringify(req.requestHeaders))) {
      matchLocations.push('request_headers');
      regex.lastIndex = 0;
    }
    if ((scope === 'all' || scope === 'request_body') && req.requestBody && regex.test(req.requestBody)) {
      matchLocations.push('request_body');
      regex.lastIndex = 0;
    }
    if ((scope === 'all' || scope === 'response_headers') && req.responseHeaders && regex.test(JSON.stringify(req.responseHeaders))) {
      matchLocations.push('response_headers');
      regex.lastIndex = 0;
    }
    if ((scope === 'all' || scope === 'response_body') && req.responseBody && regex.test(req.responseBody)) {
      matchLocations.push('response_body');
      const match = req.responseBody.match(regex);
      if (match) snippet = match[0];
      regex.lastIndex = 0;
    }

    if (matchLocations.length > 0) {
      results.push({
        request_id: req.id,
        url: req.url,
        matches_in: matchLocations,
        snippet: snippet.length > 200 ? snippet.substring(0, 200) + '...' : snippet
      });
      if (results.length >= 15) break; // Limit search results to prevent token explosion
    }
  }

  return JSON.stringify({
    pattern: args.pattern,
    total_matches: results.length,
    results: results.slice(0, 20),
  }, null, 2);
}

/** Execute analyze_security_headers tool */
export function executeAnalyzeSecurityHeaders(
  requests: CapturedRequest[],
  args: { request_id: string }
): string {
  let cleanId = args.request_id.trim();
  if (!cleanId.startsWith('dbg-')) {
    const match = cleanId.match(/(\d+)/);
    if (match) cleanId = match[1];
  }
  const req = requests.find(r => r.id === cleanId || r.shortId === cleanId || r.id === args.request_id);
  if (!req) return JSON.stringify({ error: `Request ${args.request_id} not found` });
  if (!req.responseHeaders) return JSON.stringify({ error: 'No response headers available' });

  const headers = req.responseHeaders;
  const findings: Array<{ header: string; status: string; value?: string; recommendation: string }> = [];

  // Check important security headers
  const checks: Array<{ header: string; recommendation: string }> = [
    { header: 'content-security-policy', recommendation: 'Add a Content-Security-Policy header to prevent XSS and data injection attacks' },
    { header: 'x-frame-options', recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking' },
    { header: 'x-content-type-options', recommendation: 'Add X-Content-Type-Options: nosniff to prevent MIME-type sniffing' },
    { header: 'strict-transport-security', recommendation: 'Add Strict-Transport-Security header to enforce HTTPS' },
    { header: 'x-xss-protection', recommendation: 'Add X-XSS-Protection: 1; mode=block (legacy but still useful)' },
    { header: 'referrer-policy', recommendation: 'Add Referrer-Policy: strict-origin-when-cross-origin' },
    { header: 'permissions-policy', recommendation: 'Add Permissions-Policy to restrict browser features' },
    { header: 'cross-origin-opener-policy', recommendation: 'Add Cross-Origin-Opener-Policy for cross-origin isolation' },
    { header: 'cross-origin-resource-policy', recommendation: 'Add Cross-Origin-Resource-Policy to control resource loading' },
  ];

  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  for (const check of checks) {
    const value = lowerHeaders[check.header];
    findings.push({
      header: check.header,
      status: value ? '✅ present' : '❌ missing',
      value: value || undefined,
      recommendation: value ? 'OK' : check.recommendation,
    });
  }

  // Check for info leak headers
  const infoLeakHeaders = ['server', 'x-powered-by', 'x-aspnet-version', 'x-aspnetmvc-version'];
  for (const h of infoLeakHeaders) {
    if (lowerHeaders[h]) {
      findings.push({
        header: h,
        status: '⚠️ information disclosure',
        value: lowerHeaders[h],
        recommendation: `Remove or obfuscate ${h} header to prevent server fingerprinting`,
      });
    }
  }

  return JSON.stringify({
    url: req.url,
    status: req.status,
    findings,
    missing_count: findings.filter(f => f.status.includes('missing')).length,
    info_leak_count: findings.filter(f => f.status.includes('information')).length,
  }, null, 2);
}
