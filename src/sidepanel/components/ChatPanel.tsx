import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatEntry, ToolCall } from '../../shared/types';

// ---- InlineRequestExecutor ----
interface InlineResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

function InlineRequestExecutor({ initialRequest }: { initialRequest: string }) {
  const [rawRequest, setRawRequest] = useState(initialRequest.trim());
  const [response, setResponse] = useState<InlineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bodyCollapsed, setBodyCollapsed] = useState(false);
  const [headersCollapsed, setHeadersCollapsed] = useState(true);

  const handleSend = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    chrome.runtime.sendMessage(
      { type: 'EXECUTE_RAW_HTTP', payload: { rawRequest } },
      (res) => {
        setLoading(false);
        if (res?.success) {
          setResponse({ status: res.status, statusText: res.statusText, headers: res.headers, body: res.body, duration: res.duration });
        } else {
          setError(res?.error || 'Unknown error');
        }
      }
    );
  }, [rawRequest]);

  const handleSendToRepeater = useCallback(() => {
    // Parse raw request and dispatch custom event to App.tsx
    const lines = rawRequest.trim().split(/\r?\n/);
    const [requestLine, ...rest] = lines;
    const [method, path] = (requestLine || 'GET /').trim().split(/\s+/);
    const headers: Record<string, string> = {};
    let bodyStart = rest.length;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].trim() === '') { bodyStart = i + 1; break; }
      const colon = rest[i].indexOf(':');
      if (colon !== -1) headers[rest[i].substring(0, colon).trim()] = rest[i].substring(colon + 1).trim();
    }
    const body = rest.slice(bodyStart).join('\n').trim();
    const host = headers['Host'] || headers['host'] || 'localhost';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const url = (path || '/').startsWith('http') ? (path || '/') : `${protocol}://${host}${path || '/'}`;
    window.dispatchEvent(new CustomEvent('send-to-repeater', {
      detail: { method: method || 'GET', url, headers, body }
    }));
  }, [rawRequest]);

  const statusColor = !response ? 'var(--text-muted)' :
    response.status < 300 ? '#00e676' :
    response.status < 400 ? '#ffb300' : '#ff5252';

  return (
    <div style={{
      marginTop: 8,
      border: '1px solid var(--border-color)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'rgba(0,0,0,0.3)',
    }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px', background: 'rgba(0, 229, 255, 0.05)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <span style={{ fontSize: 10, color: 'var(--accent-cyan)', fontWeight: 600 }}>🌐 HTTP Request</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleSendToRepeater}
            style={{
              background: 'rgba(255,183,0,0.12)', border: '1px solid rgba(255,183,0,0.3)',
              borderRadius: 4, padding: '2px 8px', fontSize: 10, color: '#ffb300',
              cursor: 'pointer', fontWeight: 600
            }}
          >⟳ Repeater</button>
          <button
            onClick={handleSend}
            disabled={loading}
            style={{
              background: loading ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.15)',
              border: '1px solid rgba(0,229,255,0.3)',
              borderRadius: 4, padding: '2px 10px', fontSize: 10,
              color: 'var(--accent-cyan)', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700
            }}
          >{loading ? '⟳ Sending...' : '▶ Send'}</button>
        </div>
      </div>

      {/* Editable request area */}
      <textarea
        value={rawRequest}
        onChange={e => setRawRequest(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%', boxSizing: 'border-box',
          minHeight: 90, maxHeight: 220, resize: 'vertical',
          background: 'transparent', border: 'none',
          color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 11,
          padding: '8px 10px', outline: 'none', lineHeight: 1.5,
        }}
      />

      {/* Response area */}
      {(response || error || loading) && (
        <div style={{ borderTop: '1px solid var(--border-color)' }}>
          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>⟳ Waiting for response...</div>
          )}
          {error && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: '#ff5252' }}>✗ Error: {error}</div>
          )}
          {response && (
            <div>
              {/* Status line */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 12px', background: 'rgba(0,0,0,0.2)'
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>
                  {response.status} {response.statusText}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>⏱ {response.duration}ms</span>
              </div>

              {/* Headers toggle */}
              <div
                style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-color)', userSelect: 'none' }}
                onClick={() => setHeadersCollapsed(c => !c)}
              >
                {headersCollapsed ? '▶' : '▼'} Response Headers ({Object.keys(response.headers).length})
              </div>
              {!headersCollapsed && (
                <div style={{ padding: '6px 12px', fontFamily: 'monospace', fontSize: 10,
                  color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)',
                  maxHeight: 120, overflowY: 'auto' }}>
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k}><span style={{ color: 'var(--accent-cyan)' }}>{k}</span>: {v}</div>
                  ))}
                </div>
              )}

              {/* Body */}
              <div
                style={{ padding: '4px 12px', cursor: 'pointer', fontSize: 10, color: 'var(--text-muted)',
                  borderBottom: bodyCollapsed ? 'none' : '1px solid var(--border-color)', userSelect: 'none' }}
                onClick={() => setBodyCollapsed(c => !c)}
              >
                {bodyCollapsed ? '▶' : '▼'} Response Body ({response.body.length} bytes)
              </div>
              {!bodyCollapsed && (
                <pre style={{
                  margin: 0, padding: '8px 12px', fontFamily: 'monospace', fontSize: 10,
                  color: 'var(--text-primary)', overflowX: 'auto', maxHeight: 200,
                  overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                }}>{response.body || '(empty body)'}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Message content renderer (parses code blocks) ----
const HTTP_BLOCK_RE = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S/i;

function renderMessageContent(content: string) {
  const parts: React.ReactNode[] = [];
  const segments = content.split(/(```[\s\S]*?```)/g);
  segments.forEach((seg, idx) => {
    const codeMatch = seg.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (codeMatch) {
      const lang = codeMatch[1].toLowerCase();
      const code = codeMatch[2].trim();
      const isHttp = lang === 'http' || lang === 'curl' || HTTP_BLOCK_RE.test(code);
      if (isHttp) {
        parts.push(<InlineRequestExecutor key={idx} initialRequest={code} />);
      } else {
        parts.push(
          <div key={idx} style={{
            position: 'relative', marginTop: 8, borderRadius: 6,
            background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', overflow: 'hidden'
          }}>
            {lang && <span style={{
              position: 'absolute', top: 4, right: 8, fontSize: 9,
              color: 'var(--text-muted)', fontFamily: 'monospace', textTransform: 'uppercase'
            }}>{lang}</span>}
            <pre style={{
              margin: 0, padding: '10px 12px', fontFamily: 'monospace', fontSize: 11,
              color: 'var(--text-primary)', overflowX: 'auto', whiteSpace: 'pre', maxHeight: 260, overflowY: 'auto'
            }}>{code}</pre>
          </div>
        );
      }
    } else if (seg) {
      parts.push(<span key={idx} style={{ whiteSpace: 'pre-wrap' }}>{seg}</span>);
    }
  });
  return <>{parts}</>;
}

const SUGGESTIONS = [
  "Show me all captured requests",
  "Analyze security headers for the last request",
  "Search for API keys or tokens in all traffic",
  "Test the last POST endpoint for IDOR by changing the ID",
  "Find all requests returning 4xx or 5xx errors",
];

export default function ChatPanel() {
  // State for the active project ID (used for per‑project chat persistence)
  const [projectId, setProjectId] = useState<string>('default');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls]);

  // Persist chat history whenever messages change (only after initial load has finished)
  useEffect(() => {
    if (projectId && isLoaded) {
      const key = `chatHistory_${projectId}`;
      chrome.storage.local.set({ [key]: messages });
    }
  }, [messages, projectId, isLoaded]);

  // Listen for tool call updates
  useEffect(() => {
    const listener = (message: { type: string; payload: ToolCall }) => {
      if (message.type === 'AI_TOOL_CALL') {
        setToolCalls(prev => {
          const existing = prev.findIndex(t => t.id === message.payload.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = message.payload;
            return updated;
          }
          return [...prev, message.payload];
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Load current project ID and listen for project switches
  useEffect(() => {
    // Initial load
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      const pid = response?.settings?.currentProjectId || 'default';
      setProjectId(pid);
    });
    // Listen for settings changes (project switch)
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.settings?.newValue) {
        const newPid = (changes.settings.newValue as any).currentProjectId || 'default';
        setProjectId(newPid);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  // Load saved chat history for the active project
  useEffect(() => {
    if (!projectId) return;
    setIsLoaded(false);
    const key = `chatHistory_${projectId}`;
    chrome.storage.local.get([key], (res) => {
      const saved = res[key];
      if (Array.isArray(saved)) {
        setMessages(saved);
      } else {
        setMessages([]);
      }
      setIsLoaded(true);
    });
  }, [projectId]);

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    setInput('');
    setToolCalls([]);

    const userEntry: ChatEntry = {
      role: 'user',
      content: msg,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userEntry]);
    setLoading(true);

    chrome.runtime.sendMessage(
      { type: 'AI_CHAT', payload: { message: msg, history: messages } },
      (response) => {
        setLoading(false);
        if (response?.success) {
          const assistantEntry: ChatEntry = {
            role: 'assistant',
            content: response.content,
            toolCalls: response.toolCalls,
            timestamp: Date.now(),
            usage: response.usage,
          };
          setMessages(prev => [...prev, assistantEntry]);
          setToolCalls([]);
        } else {
          const errorEntry: ChatEntry = {
            role: 'assistant',
            content: `❌ Error: ${response?.error || 'Failed to connect to AI. Make sure LM Studio is running.'}`,
            timestamp: Date.now(),
          };
          setMessages(prev => [...prev, errorEntry]);
          setToolCalls([]);
        }
      }
    );
  };

  useEffect(() => {
    const triggerListener = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt: string }>;
      if (customEvent.detail && customEvent.detail.prompt) {
        handleSend(customEvent.detail.prompt);
      }
    };
    window.addEventListener('ai-trigger-prompt', triggerListener);
    return () => window.removeEventListener('ai-trigger-prompt', triggerListener);
  }, [loading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-light)'
      }}>
        <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--text-secondary)' }}>AI PENTEST ASSISTANT</span>
        <button
          onClick={() => handleSend("Generate a comprehensive Markdown penetration testing report summarizing all captured traffic, detailing any vulnerabilities found, and suggesting remediation steps.")}
          disabled={loading}
          style={{
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid var(--accent-cyan)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 10,
            color: 'var(--accent-cyan)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-cyan)'; e.currentTarget.style.color = 'var(--bg-dark)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)'; e.currentTarget.style.color = 'var(--accent-cyan)'; }}
        >
          📋 Gen Pentest Report
        </button>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !loading && (
          <div className="chat-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" opacity="0.5">
              <path d="M12,2A10,10,0,0,0,2,12a10,10,0,0,0,1.1,4.5L2,22l5.5-1.1A10,10,0,1,0,12,2Z" />
              <circle cx="8" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="16" cy="12" r="1" fill="currentColor" />
            </svg>
            <h3>BrowseLens AI</h3>
            <p>
              Your AI pentesting assistant. Ask me to analyze<br />
              captured requests, test for vulnerabilities,<br />
              or search for sensitive data in traffic.
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="chat-suggestion"
                  onClick={() => handleSend(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="chat-msg-bubble">
              <div>{renderMessageContent(msg.content)}</div>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="chat-tool-calls">
                  {msg.toolCalls.map((tc) => (
                    <div key={tc.id} className="chat-tool-call">
                      <span className="tool-icon">🔧</span>
                      <span className="tool-name">{tc.name}</span>
                      <span className={`tool-status-${tc.status}`}>
                        {tc.status === 'done' ? '✓' : tc.status === 'error' ? '✗' : '⟳'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && msg.usage && (
                <div style={{
                  marginTop: 8,
                  paddingTop: 6,
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}>
                  <span>⚡ Tokens:</span>
                  <span>Prompt: <strong>{msg.usage.prompt_tokens || 0}</strong></span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span>Response: <strong>{msg.usage.completion_tokens || 0}</strong></span>
                  <span style={{ opacity: 0.3 }}>|</span>
                  <span>Total: <strong style={{ color: 'var(--accent-cyan)' }}>{msg.usage.total_tokens || 0}</strong></span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Show active tool calls while loading */}
        {loading && toolCalls.length > 0 && (
          <div className="chat-msg assistant">
            <div className="chat-msg-bubble">
              <div className="chat-tool-calls">
                {toolCalls.map((tc) => (
                  <div key={tc.id} className="chat-tool-call">
                    <span className="tool-icon">🔧</span>
                    <span className="tool-name">{tc.name}</span>
                    <span className={`tool-status-${tc.status}`}>
                      {tc.status === 'running' ? '⟳ running...' : tc.status === 'done' ? '✓ done' : '✗ error'}
                    </span>
                  </div>
                ))}
              </div>
              {/* Show thinking indicator if all tools are done but still loading */}
              {toolCalls.every(tc => tc.status !== 'running') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <span className="spinner" />
                  <span style={{ color: 'var(--text-muted)' }}>Synthesizing results<span className="loading-dots" /></span>
                </div>
              )}
            </div>
          </div>
        )}

        {loading && toolCalls.length === 0 && (
          <div className="chat-msg assistant">
            <div className="chat-msg-bubble" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="spinner" />
              <span style={{ color: 'var(--text-muted)' }}>Thinking<span className="loading-dots" /></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ask BrowseLens AI..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button
          className="chat-send-btn"
          onClick={() => handleSend()}
          disabled={loading || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22,2 15,22 11,13 2,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
