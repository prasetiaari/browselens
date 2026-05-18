import { useState, useRef, useEffect } from 'react';
import type { ChatEntry, ToolCall } from '../../shared/types';

const SUGGESTIONS = [
  "Show me all captured requests",
  "Analyze security headers for the last request",
  "Search for API keys or tokens in all traffic",
  "Test the last POST endpoint for IDOR by changing the ID",
  "Find all requests returning 4xx or 5xx errors",
];

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls]);

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
      { type: 'AI_CHAT', payload: { message: msg } },
      (response) => {
        setLoading(false);
        if (response?.success) {
          const assistantEntry: ChatEntry = {
            role: 'assistant',
            content: response.content,
            toolCalls: response.toolCalls,
            timestamp: Date.now(),
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
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
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
