// ============================================================
// BrowseLens — Shared Type Definitions
// ============================================================

/** A captured HTTP request with its response */
export interface CapturedRequest {
  id: string;
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

  // Timing
  duration?: number; // ms

  // Tagging
  tag?: 'red' | 'yellow' | 'green' | 'none';

  // Security Scan Results
  vulnerabilities?: string[];
}

/** Message types for chrome.runtime messaging */
export type MessageType =
  | 'REQUEST_CAPTURED'
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
  | 'SET_REQUESTS'
  | 'SWITCH_PROJECT';

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
}

export interface CustomHeader {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  targetScope: string;
  customHeaders: CustomHeader[];
}

/** Extension settings */
export interface ExtensionSettings {
  ai: {
    provider: 'lmstudio' | 'ollama' | 'openai';
    baseUrl: string;
    model: string;
    apiKey?: string;
  };
  capture: {
    filterTypes: string[]; // 'xhr', 'fetch', 'document', 'script', 'stylesheet', 'image', 'font', 'other'
    enabled: boolean;
    targetScope: string; // Keep as fallback/global
  };
  customHeaders?: CustomHeader[]; // Keep as fallback
  currentProjectId: string;
  projects: Project[];
}

/** Default settings */
export const DEFAULT_SETTINGS: ExtensionSettings = {
  ai: {
    provider: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    model: 'qwen2.5-coder-7b-instruct',
    apiKey: '',
  },
  capture: {
    filterTypes: ['xhr', 'fetch', 'document'],
    enabled: true,
    targetScope: '',
  },
  customHeaders: [],
  currentProjectId: 'default',
  projects: [
    {
      id: 'default',
      name: 'Default Project',
      createdAt: 1779065857634,
      targetScope: '',
      customHeaders: [],
    }
  ],
};
