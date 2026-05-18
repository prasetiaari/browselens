// ============================================================
// BrowseLens — AI Agent Orchestrator
// Implements the agentic loop: Prompt → Model → [Tool Call?] → Execute → Loop
// ============================================================

import type { ChatEntry, ToolCall, ExtensionSettings, CapturedRequest } from '../types';
import { TOOL_DEFINITIONS, executeGetCapturedRequests, executeGetRequestDetail, executeSearchInRequests, executeAnalyzeSecurityHeaders } from './tools';

const SYSTEM_PROMPT = `You are BrowseLens AI, a specialized security research assistant integrated into a Chrome browser extension. You help security researchers and pentesters analyze HTTP traffic, identify vulnerabilities, and test web applications.

Your capabilities (via tools):
1. **get_captured_requests** — View all intercepted HTTP requests from the browser with optional filters
2. **get_request_detail** — Inspect full details of a specific request (headers, body, response)
3. **send_http_request** — Send modified HTTP requests to test for vulnerabilities (like a repeater)
4. **search_in_requests** — Search for patterns across all captured traffic (tokens, keys, PII, etc.)
5. **analyze_security_headers** — Audit security headers of a response

Guidelines:
- Always use tools to gather data before making conclusions
- When testing for vulnerabilities, explain what you're testing and why
- Provide clear, actionable findings with severity levels
- Format responses in markdown for readability
- Be thorough but concise
- When asked to test something, execute the tests step by step and show results
- This is for authorized security testing only`;

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * The AI Agent handles the agentic loop:
 * 1. Send user message + tools to LLM
 * 2. If LLM returns tool_calls → execute them → feed results back
 * 3. Repeat until LLM returns a final text response
 */
export class AIAgent {
  private settings: ExtensionSettings;
  private requests: CapturedRequest[];
  private onToolCall?: (toolCall: ToolCall) => void;
  private onPartialResponse?: (text: string) => void;

  constructor(
    settings: ExtensionSettings,
    requests: CapturedRequest[],
    callbacks?: {
      onToolCall?: (toolCall: ToolCall) => void;
      onPartialResponse?: (text: string) => void;
    }
  ) {
    this.settings = settings;
    this.requests = requests;
    this.onToolCall = callbacks?.onToolCall;
    this.onPartialResponse = callbacks?.onPartialResponse;
  }

  /** Run the agentic loop for a user message */
  async chat(
    userMessage: string,
    history: ChatEntry[]
  ): Promise<{ content: string; toolCalls: ToolCall[] }> {
    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Add history
    for (const entry of history.slice(-20)) {
      messages.push({
        role: entry.role as 'user' | 'assistant',
        content: entry.content,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    const allToolCalls: ToolCall[] = [];
    let maxIterations = 10;
    let finalContent = '';

    // Agentic loop
    while (maxIterations-- > 0) {
      const response = await this.callLLM(messages);

      // If the model returned tool calls, execute them
      if (response.tool_calls && response.tool_calls.length > 0) {
        // Add assistant message with tool calls to conversation
        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          const tc: ToolCall = {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}'),
            status: 'running',
          };

          this.onToolCall?.(tc);
          allToolCalls.push(tc);

          try {
            const result = await this.executeTool(toolCall.function.name, tc.arguments);
            tc.result = result;
            tc.status = 'done';
          } catch (err) {
            tc.result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            tc.status = 'error';
          }

          this.onToolCall?.(tc);

          // Add tool result to conversation
          messages.push({
            role: 'tool',
            content: tc.result || '',
            tool_call_id: toolCall.id,
          });
        }
      } else {
        // No tool calls — this is the final response
        finalContent = response.content || '';
        this.onPartialResponse?.(finalContent);
        break;
      }
    }

    return { content: finalContent, toolCalls: allToolCalls };
  }

  /** Call the LLM API (OpenAI-compatible) */
  private async callLLM(messages: ChatCompletionMessage[]): Promise<{
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  }> {
    const { baseUrl, model, apiKey } = this.settings.ai;

    const body: Record<string, unknown> = {
      model,
      messages,
      tools: TOOL_DEFINITIONS,
      temperature: 0.1,
      max_tokens: 4096,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0]?.message;

    if (!choice) {
      throw new Error('No response from LLM');
    }

    return {
      content: choice.content,
      tool_calls: choice.tool_calls,
    };
  }

  /** Execute a tool by name */
  private async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    switch (name) {
      case 'get_captured_requests':
        return executeGetCapturedRequests(this.requests, args as Parameters<typeof executeGetCapturedRequests>[1]);

      case 'get_request_detail':
        return executeGetRequestDetail(this.requests, args as Parameters<typeof executeGetRequestDetail>[1]);

      case 'send_http_request':
        return await this.executeSendRequest(args as {
          url: string;
          method: string;
          headers?: string;
          body?: string;
        });

      case 'search_in_requests':
        return executeSearchInRequests(this.requests, args as Parameters<typeof executeSearchInRequests>[1]);

      case 'analyze_security_headers':
        return executeAnalyzeSecurityHeaders(this.requests, args as Parameters<typeof executeAnalyzeSecurityHeaders>[1]);

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }

  /** Execute send_http_request tool — actually sends an HTTP request */
  private async executeSendRequest(args: {
    url: string;
    method: string;
    headers?: string;
    body?: string;
  }): Promise<string> {
    try {
      const headers: Record<string, string> = {};
      if (args.headers) {
        try {
          Object.assign(headers, JSON.parse(args.headers));
        } catch {
          // headers might not be valid JSON
        }
      }

      const startTime = Date.now();
      const response = await fetch(args.url, {
        method: args.method,
        headers,
        body: args.body || undefined,
      });
      const duration = Date.now() - startTime;

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseBody: string;
      try {
        responseBody = await response.text();
        if (responseBody.length > 5000) {
          responseBody = responseBody.substring(0, 5000) + '\n... [truncated]';
        }
      } catch {
        responseBody = '[Could not read response body]';
      }

      return JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        headers: responseHeaders,
        body: responseBody,
      }, null, 2);
    } catch (err) {
      return JSON.stringify({
        error: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
