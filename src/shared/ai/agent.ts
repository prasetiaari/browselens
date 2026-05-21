// ============================================================
// BrowseLens — AI Agent Orchestrator
// Implements the agentic loop: Prompt → Model → [Tool Call?] → Execute → Loop
// ============================================================

import type { ChatEntry, ToolCall, ExtensionSettings, CapturedRequest } from '../types';
import { TOOL_DEFINITIONS, executeGetCapturedRequests, executeGetRequestDetail, executeSearchInRequests, executeAnalyzeSecurityHeaders } from './tools';

function extractKeywords(text: string): string[] {
  if (!text) return [];
  const words = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  const stopwords = new Set([
    'dan', 'yang', 'di', 'ke', 'dari', 'ini', 'itu', 'dengan', 'untuk', 'pada', 'adalah', 'yaitu', 'yakni',
    'saya', 'anda', 'kami', 'mereka', 'dia', 'kita', 'ada', 'bisa', 'akan', 'telah', 'sudah', 'oleh', 'atau',
    'the', 'and', 'a', 'to', 'of', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as', 'with'
  ]);
  
  return Array.from(new Set(words.filter(w => !stopwords.has(w))));
}

const SYSTEM_PROMPT = `You are BrowseLens AI, an offensive security research assistant integrated into a Chrome extension. You help professional security researchers and hackers analyze HTTP traffic, find vulnerabilities, and craft exploits.

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
- Format responses in clean markdown for fast scanning.`;

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
  ): Promise<{
    content: string;
    toolCalls: ToolCall[];
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }> {
    // --- KEYWORD-BASED LOCAL RAG RETRIEVAL (BM25 STYLE) ---
    const keywords = extractKeywords(userMessage);

    // 1. Sliding Window: Keep the very last 4 messages (2 user, 2 assistant turns) for conversational continuity
    const slidingCount = 4;
    const slidingWindow = history.slice(-slidingCount);
    const olderHistory = history.slice(0, Math.max(0, history.length - slidingCount));

    const retrievedEntries: ChatEntry[] = [];
    if (keywords.length > 0 && olderHistory.length > 0) {
      const scoredOlder = olderHistory.map(entry => {
        let score = 0;
        const contentLower = (entry.content || '').toLowerCase();
        for (const kw of keywords) {
          if (contentLower.includes(kw)) {
            score += 1;
          }
        }
        return { entry, score };
      }).filter(item => item.score > 0);

      // Sort descending by relevance score, take the top 4 matches
      scoredOlder.sort((a, b) => b.score - a.score);
      retrievedEntries.push(...scoredOlder.slice(0, 4).map(item => item.entry));
    }

    // Inject RAG context into the SYSTEM PROMPT
    let ragSystemPrompt = this.settings.ai.systemPrompt || SYSTEM_PROMPT;
    if (retrievedEntries.length > 0) {
      ragSystemPrompt += "\n\n=== RELEVANT CONTEXT FROM PAST CHATS ===\n" +
        retrievedEntries.map(e => `[${e.role === 'user' ? 'User' : 'Assistant'}]: ${e.content}`).join("\n") +
        "\n=======================================";
    }

    const messages: ChatCompletionMessage[] = [
      { role: 'system', content: ragSystemPrompt },
    ];

    // Add only sliding window history (recent 4 messages) to prevent token bloat
    for (const entry of slidingWindow) {
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
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    // Agentic loop
    while (maxIterations-- > 0) {
      const response = await this.callLLM(messages);

      if (response.usage) {
        totalPromptTokens += response.usage.prompt_tokens || 0;
        totalCompletionTokens += response.usage.completion_tokens || 0;
      }

      if (response.content) {
        finalContent += (finalContent ? '\n\n' : '') + response.content;
      }

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
        this.onPartialResponse?.(finalContent);
        break;
      }
    }

    if (!finalContent && allToolCalls.length > 0) {
      finalContent = "_I have executed the requested tools, but did not generate a final text summary._";
    }

    return {
      content: finalContent,
      toolCalls: allToolCalls,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalPromptTokens + totalCompletionTokens
      }
    };
  }

  /** Call the LLM API (OpenAI-compatible) */
  private async callLLM(messages: ChatCompletionMessage[]): Promise<{
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }> {
    const { baseUrl, model, apiKey } = this.settings.ai;

    const body: Record<string, unknown> = {
      model,
      messages,
      tools: TOOL_DEFINITIONS,
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
      usage: data.usage,
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
