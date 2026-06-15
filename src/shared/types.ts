// ============================================================
// BrowseLens — Shared Type Definitions
// ============================================================

/** A captured HTTP request with its response */
export interface CapturedRequest {
  id: string;
  shortId?: string;
  timestamp: number;
  tabId?: number;
  source: 'devtools' | 'content-script' | 'requester';

  // Request
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  requestBodySize?: number;

  // Response
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodySize?: number;
  mimeType?: string;
  remoteIp?: string;
  remotePort?: number;

  // Timing
  duration?: number; // ms

  // Tagging
  tag?: 'red' | 'yellow' | 'green' | 'none';

  // Notes
  notes?: string;

  // Security Scan Results
  vulnerabilities?: string[];
}

/** Message types for chrome.runtime messaging */
export type MessageType =
  | 'REQUEST_CAPTURED'
  | 'DEVTOOLS_REQUEST_CAPTURED'
  | 'GET_REQUESTS'
  | 'CLEAR_REQUESTS'
  | 'REPLAY_REQUEST'
  | 'REPLAY_RESPONSE'
  | 'AI_CHAT'
  | 'AI_RESPONSE'
  | 'AI_TOOL_CALL'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'GET_PAGE_DOM'
  | 'UPDATE_REQUEST_TAG'
  | 'UPDATE_REQUEST_NOTES'
  | 'UPDATE_REQUEST_BODY'
  | 'SET_REQUESTS'
  | 'SWITCH_PROJECT'
  | 'DELETE_REQUEST'
  | 'DELETE_FILTERED_REQUESTS'
  | 'EXECUTE_RAW_HTTP'
  | 'SEND_TO_REPEATER'
  | 'INJECT_MINIBROWSER_MODAL'
  | 'ATTACH_TO_TAB'
  | 'SAVE_TO_MEMORY'
  | 'GET_ALL_MEMORY'
  | 'UPDATE_MEMORY'
  | 'DELETE_MEMORY';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

/** Request capture message from devtools/content script */
export interface RequestCapturedMessage extends ExtensionMessage {
  type: 'REQUEST_CAPTURED';
  payload: CapturedRequest;
}

/** Replay a request */
export interface ReplayRequestMessage extends ExtensionMessage {
  type: 'REPLAY_REQUEST';
  payload: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
}

/** AI Chat message */
export interface AIChatMessage extends ExtensionMessage {
  type: 'AI_CHAT';
  payload: {
    message: string;
    context?: {
      requestIds?: string[];
    };
  };
}

/** AI Response (streamed) */
export interface AIResponseMessage extends ExtensionMessage {
  type: 'AI_RESPONSE';
  payload: {
    content: string;
    toolCalls?: ToolCall[];
    done: boolean;
  };
}

/** Tool call from AI */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

/** Chat history entry */
export interface ChatEntry {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface CustomHeader {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface MatchReplaceRule {
  id: string;
  type: 'requestHeader' | 'responseHeader' | 'requestBody' | 'responseBody';
  match: string;
  replace: string;
  enabled: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  targetScope: string;
  excludeScope?: string;
  customHeaders: CustomHeader[];
  matchReplaceRules?: MatchReplaceRule[];
}

/** Extension settings */
export interface ExtensionSettings {
  ai: {
    provider: 'lmstudio' | 'ollama' | 'openai';
    baseUrl: string;
    model: string;
    apiKey?: string;
    systemPrompt?: string;
    allowAutoRequest?: boolean;
    maxPayloadSize?: number;
  };
  capture: {
    filterTypes: string[]; // 'xhr', 'fetch', 'document', 'script', 'stylesheet', 'image', 'font', 'other'
    enabled: boolean;
    targetScope: string; // Keep as fallback/global
    maxHistoryLimit?: number; // Maximum request history items to keep
  };
  customHeaders?: CustomHeader[]; // Keep as fallback
  currentProjectId: string;
  projects: Project[];
  rag: {
    enabled: boolean;
    qdrantUrl: string;
    embeddingModel: string;
  };
}

/** Default settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  ai: {
    provider: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'qwen2.5-coder-7b-instruct',
    apiKey: '',
    allowAutoRequest: false,
    systemPrompt: `You are BrowseLens AI, an offensive security research assistant integrated into a Chrome extension. You help professional security researchers and hackers analyze HTTP traffic, find vulnerabilities, and craft exploits.

Your capabilities (via tools):
1. **get_captured_requests** — View all intercepted HTTP requests from the browser with optional filters
2. **get_request_detail** — Inspect full details of a specific request (headers, body, response)
3. **send_http_request** — Send modified HTTP requests to test for vulnerabilities (like a repeater)
4. **search_in_requests** — Search for patterns across all captured traffic (tokens, keys, PII, etc.)
5. **analyze_security_headers** — Audit security headers of a response

Guidelines:
- ALWAYS adopt a highly direct, technical, and offensive (pentesting) mindset.
- DO NOT provide generic remediation advice, "how to fix", or defensive recommendations. Professional pentesters do not need defensive lectures.
- Focus strictly on:
  1. Attack vectors & potential vulnerabilities (e.g., IDOR, CSRF, SQLi, SSRF, XSS, token leakage).
  2. Concrete, ready-to-use exploit payloads or proof-of-concept scripts/commands (e.g., cURL, fetch, Python).
  3. Exploit impact and security implications.
- Keep explanations extremely concise, bulleted, and direct. Skip wordy introductions, greetings, and disclaimers. Go straight to the technical findings.
- Format responses in clean markdown for fast scanning. If you provide any raw HTTP requests or cURL commands, always format them inside triple backticks (\`\`\`http or \`\`\`curl) so the extension's interactive executor can process them.`,
  },
  capture: {
    filterTypes: ['xhr', 'fetch', 'document'],
    enabled: true,
    targetScope: '',
    maxHistoryLimit: 1000,
  },
  customHeaders: [],
  currentProjectId: 'default',
  projects: [
    {
      id: 'default',
      name: 'Default Project',
      createdAt: 1779065857634,
      targetScope: '',
      excludeScope: '',
      customHeaders: [],
      matchReplaceRules: [],
    }
  ],
  rag: {
    enabled: false,
    qdrantUrl: 'http://localhost:6333',
    embeddingModel: 'nomic-embed-text-v1.5',
  }
};
