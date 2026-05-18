import { useState } from 'react';
import type { CapturedRequest } from '../../shared/types';

type DetailTab = 'headers' | 'body' | 'response';

interface Props {
  request: CapturedRequest;
  onSendToRepeater: (req: CapturedRequest) => void;
  onAskAI: (prompt: string) => void;
  onClose: () => void;
  onSendToBase64?: (text: string) => void;
  onSendToJwt?: (text: string) => void;
}

function getStatusClass(status?: number): string {
  if (!status) return '';
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

import { exportToCurl, exportToPython, exportToFetch } from '../../shared/export';

export default function RequestDetail({ request, onSendToRepeater, onAskAI, onClose, onSendToBase64, onSendToJwt }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('headers');
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: string) => {
    if (!type) return;
    let str = '';
    if (type === 'curl') str = exportToCurl(request);
    else if (type === 'python') str = exportToPython(request);
    else if (type === 'fetch') str = exportToFetch(request);
    
    if (str) {
      try {
        await navigator.clipboard.writeText(str);
        setExporting(true);
        setTimeout(() => setExporting(false), 1000);
      } catch (err) {
        console.error('Failed to copy', err);
      }
    }
  };

  return (
    <div className="request-detail">
      <div className="detail-header" style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`request-method ${request.method}`} style={{ fontSize: 10 }}>
            {request.method}
          </span>
          <span className={`request-status ${getStatusClass(request.status)}`}>
            {request.status}
          </span>
          
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', marginRight: 8 }}>
            {(['red', 'yellow', 'green'] as const).map(tag => (
              <button
                key={tag}
                title={`Tag: ${tag}`}
                className="tag-selector-btn"
                onClick={() => {
                  const newTag = request.tag === tag ? 'none' : tag;
                  chrome.runtime.sendMessage({
                    type: 'UPDATE_REQUEST_TAG',
                    payload: { id: request.id, tag: newTag }
                  });
                }}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: 'none',
                  background: `var(--accent-${tag})`,
                  opacity: request.tag === tag ? 1 : 0.3,
                  boxShadow: request.tag === tag ? `0 0 6px var(--accent-${tag})` : 'none',
                }}
              />
            ))}
          </div>
        </div>
        <div className="detail-tabs">
          <button
            className={`detail-tab ${activeTab === 'headers' ? 'active' : ''}`}
            onClick={() => setActiveTab('headers')}
          >Headers</button>
          <button
            className={`detail-tab ${activeTab === 'body' ? 'active' : ''}`}
            onClick={() => setActiveTab('body')}
          >Body</button>
          <button
            className={`detail-tab ${activeTab === 'response' ? 'active' : ''}`}
            onClick={() => setActiveTab('response')}
          >Response</button>
        </div>
        <div className="detail-actions">
          <select 
            className="detail-action-btn"
            style={{ 
              appearance: 'none', 
              background: 'transparent', 
              border: '1px solid var(--border-color)', 
              padding: '2px 8px', 
              borderRadius: 4, 
              color: exporting ? 'var(--accent-green)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
            onChange={(e) => {
              handleExport(e.target.value);
              e.target.value = '';
            }}
            value=""
          >
            <option value="" disabled>{exporting ? 'Copied!' : 'Export ▾'}</option>
            <option value="curl">Copy as cURL</option>
            <option value="python">Copy as Python</option>
            <option value="fetch">Copy as Fetch</option>
          </select>
          <button className="detail-action-btn" onClick={() => onSendToRepeater(request)}>
            ↗ Send to Repeater
          </button>
          <button
            className="detail-action-btn"
            onClick={() => onAskAI(`Briefly explain the offensive significance of this HTTP request. What parameters look interesting, what is its purpose, and what attack vectors (e.g. IDOR, Parameter Pollution, SQLi, SSRF) should I target here? Keep it short, bulleted, and go straight to the point:\n\nMethod: ${request.method}\nURL: ${request.url}\nHeaders: ${JSON.stringify(request.requestHeaders, null, 2)}\nBody: ${request.requestBody || '(empty)'}`)}
            title="AI: Explain Request"
          >
            🤖 AI Explain
          </button>
          <button
            className="detail-action-btn"
            onClick={() => onAskAI(`Perform an offensive security audit on this HTTP request/response. Identify attack vectors, list potential vulnerabilities, and suggest concrete exploit payloads or PoC commands. DO NOT give remediation or defense advice. Keep it strictly focused on exploitation, highly direct, and bulleted:\n\nMethod: ${request.method}\nURL: ${request.url}\nRequest Headers: ${JSON.stringify(request.requestHeaders, null, 2)}\nRequest Body: ${request.requestBody || '(empty)'}\nResponse Headers: ${JSON.stringify(request.responseHeaders || {}, null, 2)}\nPassive Scan Warnings: ${JSON.stringify(request.vulnerabilities || [], null, 2)}`)}
            title="AI: Security Audit"
          >
            🚨 AI Audit
          </button>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="detail-body">
        {activeTab === 'headers' && (
          <>
            <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--text-muted)' }}>
              {request.url}
            </div>
            
            {request.vulnerabilities && request.vulnerabilities.length > 0 && (
              <div style={{
                marginBottom: 12,
                padding: '8px 12px',
                background: 'rgba(255, 68, 68, 0.1)',
                borderLeft: '3px solid var(--accent-red)',
                borderRadius: 4
              }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--accent-red)', marginBottom: 4 }}>
                  🚨 Passive Scan Warnings ({request.vulnerabilities.length})
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, color: 'var(--text-secondary)' }}>
                  {request.vulnerabilities.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Request Headers
              </div>
              <div className="detail-kv">
                {Object.entries(request.requestHeaders).map(([key, value]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <span className="detail-key">{key}</span>
                    <span className="detail-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, wordBreak: 'break-all' }}>
                      <span>{value as string}</span>
                      <span className="header-value-actions" style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => onSendToBase64?.(value as string)}
                          style={{
                            background: 'rgba(0, 229, 255, 0.1)',
                            border: '1px solid var(--accent-cyan)',
                            borderRadius: 3,
                            color: 'var(--accent-cyan)',
                            fontSize: 7,
                            fontWeight: 700,
                            padding: '1px 3px',
                            cursor: 'pointer',
                          }}
                          title="Send to Base64 Decoder"
                        >
                          B64
                        </button>
                        {((value as string).includes('eyJ') || (value as string).startsWith('eyJ')) && (
                          <button
                            onClick={() => {
                              let token = value as string;
                              if (token.toLowerCase().startsWith('bearer ')) {
                                token = token.substring(7);
                              }
                              onSendToJwt?.(token);
                            }}
                            style={{
                              background: 'rgba(255, 51, 102, 0.1)',
                              border: '1px solid #ff3366',
                              borderRadius: 3,
                              color: '#ff3366',
                              fontSize: 7,
                              fontWeight: 700,
                              padding: '1px 3px',
                              cursor: 'pointer',
                            }}
                            title="Send to JWT Decoder"
                          >
                            JWT
                          </button>
                        )}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {request.responseHeaders && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                  Response Headers
                </div>
                <div className="detail-kv">
                  {Object.entries(request.responseHeaders).map(([key, value]) => (
                    <div key={key} style={{ display: 'contents' }}>
                      <span className="detail-key">{key}</span>
                      <span className="detail-value" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, wordBreak: 'break-all' }}>
                        <span>{value as string}</span>
                        <span className="header-value-actions" style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={() => onSendToBase64?.(value as string)}
                            style={{
                              background: 'rgba(0, 229, 255, 0.1)',
                              border: '1px solid var(--accent-cyan)',
                              borderRadius: 3,
                              color: 'var(--accent-cyan)',
                              fontSize: 7,
                              fontWeight: 700,
                              padding: '1px 3px',
                              cursor: 'pointer',
                            }}
                            title="Send to Base64 Decoder"
                          >
                            B64
                          </button>
                          {((value as string).includes('eyJ') || (value as string).startsWith('eyJ')) && (
                            <button
                              onClick={() => {
                                let token = value as string;
                                if (token.toLowerCase().startsWith('bearer ')) {
                                  token = token.substring(7);
                                }
                                onSendToJwt?.(token);
                              }}
                              style={{
                                background: 'rgba(255, 51, 102, 0.1)',
                                border: '1px solid #ff3366',
                                borderRadius: 3,
                                color: '#ff3366',
                                fontSize: 7,
                                fontWeight: 700,
                                padding: '1px 3px',
                                cursor: 'pointer',
                              }}
                              title="Send to JWT Decoder"
                            >
                              JWT
                            </button>
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'body' && (
          <div className="detail-raw">
            {formatBody(request.requestBody) || '(no request body)'}
          </div>
        )}

        {activeTab === 'response' && (
          <div className="detail-raw">
            {formatBody(request.responseBody) || '(no response body captured)'}
          </div>
        )}
      </div>
    </div>
  );
}
