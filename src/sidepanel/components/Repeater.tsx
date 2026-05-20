import { useState, useEffect } from 'react';

interface Props {
  initialRequest?: {
    method: string;
    url: string;
    headers: string;
    body: string;
  } | null;
}

interface ReplayResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

type RepeaterTab = 'req_headers' | 'req_body' | 'response';

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 's2xx';
  if (status >= 300 && status < 400) return 's3xx';
  if (status >= 400 && status < 500) return 's4xx';
  return 's5xx';
}

function formatBody(body?: string): string {
  if (!body) return '';
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return body; // Not valid JSON, return as is
  }
}

export default function Repeater({ initialRequest }: Props) {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('{\n  "Accept": "*/*"\n}');
  const [body, setBody] = useState('');
  
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<ReplayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<RepeaterTab>('req_headers');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [showPayloads, setShowPayloads] = useState(false);
  const [payloadCopied, setPayloadCopied] = useState<string | null>(null);

  const payloads = [
    {
      category: '💉 SQL Injection (SQLi)',
      items: [
        { name: "Auth Bypass (Quote)", value: "' OR '1'='1" },
        { name: "Auth Bypass (Dash)", value: "admin' --" },
        { name: "UNION Select", value: "' UNION SELECT NULL, NULL, NULL --" },
      ]
    },
    {
      category: '👁️ Cross-Site Scripting (XSS)',
      items: [
        { name: "Basic Alert Script", value: "<script>alert(1)</script>" },
        { name: "SVG Onload", value: "\"><svg onload=alert(1)>" },
        { name: "Javascript URI", value: "javascript:alert(1)" },
      ]
    },
    {
      category: '📂 Path Traversal (LFI)',
      items: [
        { name: "Linux Passwd", value: "../../../../etc/passwd" },
        { name: "Windows Win.ini", value: "..\\..\\..\\..\\windows\\win.ini" },
      ]
    },
    {
      category: '🌐 Server-Side Request Forgery (SSRF)',
      items: [
        { name: "AWS Metadata", value: "http://169.254.169.254/latest/meta-data/" },
        { name: "Localhost API", value: "http://localhost:8080" },
      ]
    },
    {
      category: '💻 Command Injection (RCE)',
      items: [
        { name: "Unix Semi-colon", value: "; id;" },
        { name: "Unix Pipe", value: "| cat /etc/passwd" },
      ]
    }
  ];

  useEffect(() => {
    if (initialRequest) {
      setMethod(initialRequest.method);
      setUrl(initialRequest.url);
      setHeaders(initialRequest.headers);
      setBody(initialRequest.body);
      setResponse(null);
      setError(null);
      setActiveTab('req_headers');
    }
  }, [initialRequest]);

  useEffect(() => {
    const handleImportUrl = (e: Event) => {
      const targetUrl = (e as CustomEvent).detail?.url || '';
      if (targetUrl) {
        setUrl(targetUrl);
        setResponse(null);
        setError(null);
        setActiveTab('req_headers');
      }
    };
    window.addEventListener('repeater-import-url', handleImportUrl);
    return () => {
      window.removeEventListener('repeater-import-url', handleImportUrl);
    };
  }, []);

  const handleSend = async () => {
    if (!url) return;
    setSending(true);
    setError(null);
    setResponse(null);
    setActiveTab('response'); // Auto switch to response tab

    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = JSON.parse(headers);
    } catch {
      // ignore parse errors
    }

    chrome.runtime.sendMessage(
      {
        type: 'REPLAY_REQUEST',
        payload: { method, url, headers: parsedHeaders, body: body || undefined },
      },
      (res) => {
        setSending(false);
        if (res?.success) {
          setResponse(res.response);
        } else {
          setError(res?.error || 'Unknown error');
        }
      }
    );
  };

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  return (
    <div className="repeater">
      {/* URL Bar */}
      <div className="repeater-bar">
        <select
          className="repeater-method-select"
          value={method}
          onChange={e => {
            setMethod(e.target.value);
            if (activeTab === 'req_body' && !['POST', 'PUT', 'PATCH'].includes(e.target.value)) {
              setActiveTab('req_headers');
            }
          }}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          className="repeater-url-input"
          placeholder="https://example.com/api/endpoint"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button
          className="repeater-send-btn"
          style={{ background: 'transparent', border: '1.5px solid var(--accent-yellow)', color: 'var(--accent-yellow)', marginRight: 6, fontWeight: 700 }}
          onClick={() => setShowPayloads(prev => !prev)}
          title="Open Curated Attack Payloads Library"
        >
          ⚡ Payloads
        </button>
        <button
          className="repeater-send-btn"
          onClick={handleSend}
          disabled={sending || !url}
        >
          {sending ? (
            <span className="spinner" />
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22,2 15,22 11,13 2,9" />
              </svg>
              Send
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="detail-header" style={{ padding: '6px 12px' }}>
        <div className="detail-tabs">
          <button
            className={`detail-tab ${activeTab === 'req_headers' ? 'active' : ''}`}
            onClick={() => setActiveTab('req_headers')}
          >
            Headers
          </button>
          {hasBody && (
            <button
              className={`detail-tab ${activeTab === 'req_body' ? 'active' : ''}`}
              onClick={() => setActiveTab('req_body')}
            >
              Body
            </button>
          )}
          <button
            className={`detail-tab ${activeTab === 'response' ? 'active' : ''}`}
            onClick={() => setActiveTab('response')}
          >
            Response {response && <span style={{ marginLeft: 4, color: 'var(--text-muted)' }}>({response.status})</span>}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="repeater-editor" style={{ display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'req_headers' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Request Headers (JSON)
              </label>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: 10, cursor: 'pointer', opacity: 0.8 }}
                onClick={() => setHeaders(formatBody(headers))}
              >
                {`{ } Format JSON`}
              </button>
            </div>
            <textarea
              className="repeater-textarea"
              style={{ flex: 1 }}
              value={headers}
              onChange={e => setHeaders(e.target.value)}
              placeholder='{"Authorization": "Bearer token"}'
            />
          </div>
        )}

        {activeTab === 'req_body' && hasBody && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Request Body
              </label>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: 10, cursor: 'pointer', opacity: 0.8 }}
                onClick={() => setBody(formatBody(body))}
              >
                {`{ } Format JSON`}
              </button>
            </div>
            <textarea
              className="repeater-textarea"
              style={{ flex: 1 }}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder='{"key": "value"}'
            />
          </div>
        )}

        {activeTab === 'response' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {response && (
                  <>
                    <span className={`repeater-status ${getStatusClass(response.status)}`}>
                      {response.status} {response.statusText}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {response.duration}ms
                    </span>
                  </>
                )}
              </div>
              {response && (
                <div className="detail-tabs">
                  <button
                    className={`detail-tab ${responseTab === 'body' ? 'active' : ''}`}
                    onClick={() => setResponseTab('body')}
                  >Body</button>
                  <button
                    className={`detail-tab ${responseTab === 'headers' ? 'active' : ''}`}
                    onClick={() => setResponseTab('headers')}
                  >Headers</button>
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sending && (
                <div style={{ color: 'var(--accent-cyan)', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  <span className="spinner" style={{ marginRight: 8, display: 'inline-block', verticalAlign: 'middle' }} />
                  Sending request...
                </div>
              )}
              {error && !sending && (
                <div style={{ color: 'var(--accent-red)', fontSize: 12 }}>
                  ❌ {error}
                </div>
              )}
              {!response && !error && !sending && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  Click Send to view response
                </div>
              )}
              {response && !sending && responseTab === 'body' && (
                <div className="detail-raw" style={{ minHeight: '100%' }}>{formatBody(response.body)}</div>
              )}
              {response && !sending && responseTab === 'headers' && (
                <div className="detail-kv">
                  {Object.entries(response.headers).map(([key, value]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <span className="detail-key">{key}</span>
                      <span className="detail-value">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Payloads Cheat Sheet Drawer */}
      {showPayloads && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '260px',
          bottom: 0,
          background: 'rgba(10, 14, 20, 0.96)',
          backdropFilter: 'blur(10px)',
          borderLeft: '1px solid var(--border-primary)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          padding: '14px',
          boxSizing: 'border-box',
          boxShadow: '-8px 0 24px rgba(0, 0, 0, 0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', letterSpacing: '0.5px' }}>
              ⚡ Attack Payloads
            </span>
            <button
              onClick={() => setShowPayloads(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
              title="Close Panel"
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {payloads.map((cat, idx) => (
              <div key={idx}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '0.5px' }}>
                  {cat.category}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {cat.items.map((item, i) => (
                    <button
                      key={i}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(item.value);
                          setPayloadCopied(item.value);
                          setTimeout(() => setPayloadCopied(null), 1500);
                        } catch {}
                      }}
                      style={{
                        textAlign: 'left',
                        background: payloadCopied === item.value ? 'rgba(0, 255, 136, 0.05)' : 'var(--bg-darker)',
                        border: payloadCopied === item.value ? '1px solid var(--accent-green)' : '1px solid var(--border-primary)',
                        borderRadius: 4,
                        padding: '6px 10px',
                        color: payloadCopied === item.value ? 'var(--accent-green)' : 'var(--text-primary)',
                        fontSize: 11,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        fontFamily: 'var(--font-sans)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      title={`Copy Payload: ${item.value}`}
                    >
                      <span style={{ fontWeight: 500 }}>{item.name}</span>
                      <span style={{ fontSize: 10 }}>
                        {payloadCopied === item.value ? '✓' : '📋'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
