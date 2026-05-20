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

function decodeBase64(str: string): string {
  try {
    return atob(str.trim());
  } catch (err) {
    try {
      let clean = str.replace(/-/g, '+').replace(/_/g, '/');
      while (clean.length % 4) {
        clean += '=';
      }
      return atob(clean);
    } catch {
      return `[Decoding Failed: Invalid Base64 String]`;
    }
  }
}

function decodeJwt(token: string): { header: string; payload: string; error?: string } {
  try {
    const parts = token.trim().split('.');
    if (parts.length < 2) {
      return { header: '', payload: '', error: 'Invalid JWT structure' };
    }
    
    const decodePart = (base64Url: string) => {
      let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }
      const raw = atob(base64);
      try {
        const parsed = JSON.parse(raw);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return raw;
      }
    };

    const header = decodePart(parts[0]);
    const payload = decodePart(parts[1]);
    return { header, payload };
  } catch (err: any) {
    return { header: '', payload: '', error: err?.message || 'JWT parsing failed' };
  }
}

import { exportToCurl, exportToPython, exportToFetch } from '../../shared/export';

export default function RequestDetail({ request, onSendToRepeater, onAskAI, onClose, onSendToBase64, onSendToJwt }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('headers');
  const [exporting, setExporting] = useState(false);
  const [decodedB64Val, setDecodedB64Val] = useState<string | null>(null);
  const [decodedJwtVal, setDecodedJwtVal] = useState<{ header: string; payload: string; error?: string } | null>(null);
  const [modalCopied, setModalCopied] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(false);

  // Live preview & fetcher states
  const [liveContent, setLiveContent] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);

  if (lastRequestId !== request.id) {
    setLastRequestId(request.id);
    setLiveContent(null);
    setLiveError(null);
    setLoadingLive(false);
  }

  let detectedMime = (request.mimeType || '').toLowerCase();
  if (request.responseBody && request.responseBody.startsWith('[Response body discarded for static assets:')) {
    const startIdx = request.responseBody.indexOf(': ') + 2;
    const endIdx = request.responseBody.lastIndexOf(']');
    if (startIdx > 1 && endIdx > startIdx) {
      detectedMime = request.responseBody.substring(startIdx, endIdx).trim().toLowerCase();
    }
  }

  const getUrlExtension = (urlStr?: string): string => {
    if (!urlStr) return '';
    try {
      const url = new URL(urlStr);
      const pathname = url.pathname.toLowerCase();
      const lastDot = pathname.lastIndexOf('.');
      if (lastDot !== -1) {
        return pathname.substring(lastDot);
      }
    } catch (_) {
      const cleanUrl = urlStr.split('?')[0].split('#')[0].toLowerCase();
      const lastDot = cleanUrl.lastIndexOf('.');
      if (lastDot !== -1) {
        return cleanUrl.substring(lastDot);
      }
    }
    return '';
  };

  const ext = getUrlExtension(request.url);

  const isImage = 
    detectedMime.startsWith('image/') ||
    ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'].includes(ext);

  const isFont =
    detectedMime.startsWith('font/') ||
    ['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext);

  const isCss =
    detectedMime.includes('css') ||
    ext === '.css';

  const isJs =
    detectedMime.includes('javascript') || 
    detectedMime.includes('x-javascript') ||
    ext === '.js';

  const isFetchableText = 
    isCss || 
    isJs || 
    detectedMime.includes('json') || 
    detectedMime.includes('text') || 
    detectedMime.includes('xml') || 
    detectedMime.includes('html') ||
    ['.json', '.html', '.xml', '.txt'].includes(ext);

  const handleFetchLive = async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const res = await fetch(request.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const text = await res.text();
      setLiveContent(text);
    } catch (err: any) {
      setLiveError(err.message || 'Failed to fetch live content');
    } finally {
      setLoadingLive(false);
    }
  };

  const handleUpdateNotes = (notesText: string) => {
    chrome.runtime.sendMessage({
      type: 'UPDATE_REQUEST_NOTES',
      payload: { id: request.id, notes: notesText }
    });
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1200);
  };

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
            <button
              onClick={() => {
                if (confirm('Delete this request permanently?')) {
                  chrome.runtime.sendMessage({
                    type: 'DELETE_REQUEST',
                    payload: { id: request.id }
                  });
                  onClose();
                }
              }}
              style={{
                background: 'rgba(255, 51, 102, 0.08)',
                border: '1px solid rgba(255, 51, 102, 0.3)',
                color: 'var(--accent-red)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginLeft: 10,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-red)';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.boxShadow = '0 0 8px rgba(255, 51, 102, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 51, 102, 0.08)';
                e.currentTarget.style.color = 'var(--accent-red)';
                e.currentTarget.style.boxShadow = 'none';
              }}
              title="Delete request"
            >
              <img 
                src={chrome.runtime.getURL('icons/ui/delete.svg')} 
                alt="Delete" 
                style={{ width: 11, height: 11 }} 
              />
              Delete
            </button>
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
          <button className="detail-action-btn" onClick={() => onSendToRepeater(request)} style={{ display: 'flex', alignItems: 'center' }}>
            <img 
              src={chrome.runtime.getURL('icons/ui/repeater.svg')} 
              alt="Send to Repeater" 
              style={{ width: 12, height: 12, marginRight: 4 }} 
            />
            Send to Repeater
          </button>
          <button
            className="detail-action-btn"
            onClick={() => onAskAI(`Briefly explain the offensive significance of this HTTP request. What parameters look interesting, what is its purpose, and what attack vectors (e.g. IDOR, Parameter Pollution, SQLi, SSRF) should I target here? Keep it short, bulleted, and go straight to the point:\n\nMethod: ${request.method}\nURL: ${request.url}\nHeaders: ${JSON.stringify(request.requestHeaders, null, 2)}\nBody: ${request.requestBody || '(empty)'}`)}
            title="AI: Explain Request"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <img 
              src={chrome.runtime.getURL('icons/ui/explain.svg')} 
              alt="Explain" 
              style={{ width: 12, height: 12, marginRight: 4 }} 
            />
            AI Explain
          </button>
          <button
            className="detail-action-btn"
            onClick={() => onAskAI(`Perform an offensive security audit on this HTTP request/response. Identify attack vectors, list potential vulnerabilities, and suggest concrete exploit payloads or PoC commands. DO NOT give remediation or defense advice. Keep it strictly focused on exploitation, highly direct, and bulleted:\n\nMethod: ${request.method}\nURL: ${request.url}\nRequest Headers: ${JSON.stringify(request.requestHeaders, null, 2)}\nRequest Body: ${request.requestBody || '(empty)'}\nResponse Headers: ${JSON.stringify(request.responseHeaders || {}, null, 2)}\nPassive Scan Warnings: ${JSON.stringify(request.vulnerabilities || [], null, 2)}`)}
            title="AI: Security Audit"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <img 
              src={chrome.runtime.getURL('icons/ui/audit.svg')} 
              alt="Audit" 
              style={{ width: 12, height: 12, marginRight: 4 }} 
            />
            AI Audit
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
        {/* TOP LEVEL LIVE PREVIEWS (🖼️ / 🔤) */}
        {isImage && (
          <div className="live-preview-container" style={{
            marginBottom: 16,
            padding: 18,
            borderRadius: 8,
            border: '1px solid var(--accent-cyan)',
            background: 'rgba(0, 229, 255, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 4px 20px rgba(0, 229, 255, 0.08)'
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🖼️ Live Image Preview</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'var(--accent-cyan)', color: '#000', fontWeight: 800 }}>LIVE</span>
            </div>
            <div style={{
              position: 'relative',
              padding: 12,
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              background: '#0a0e14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 180,
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden'
            }}>
              <img 
                src={request.url} 
                alt="Live preview" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: 320, 
                  objectFit: 'contain',
                  borderRadius: 4
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const errEl = document.createElement('div');
                    errEl.innerText = '⚠️ Live preview blocked (Authentication or CORS required)';
                    errEl.style.fontSize = '12px';
                    errEl.style.color = 'var(--accent-red)';
                    errEl.style.fontWeight = '700';
                    parent.appendChild(errEl);
                  }
                }}
              />
            </div>
            <a 
              href={request.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                color: 'var(--accent-cyan)',
                textDecoration: 'none',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              Open Asset URL in New Tab ↗
            </a>
          </div>
        )}

        {isFont && (
          <div className="live-preview-container" style={{
            marginBottom: 16,
            padding: 18,
            borderRadius: 8,
            border: '1px solid var(--accent-cyan)',
            background: 'rgba(0, 229, 255, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 4px 20px rgba(0, 229, 255, 0.08)'
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 1.5, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>🔤 Dynamic Font Preview</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 10, background: 'var(--accent-cyan)', color: '#000', fontWeight: 800 }}>LIVE</span>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
              @font-face {
                font-family: 'top-preview-font-${request.id}';
                src: url('${request.url}');
              }
            `}} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type to test this custom font live:</label>
              <input 
                type="text"
                defaultValue="The quick brown fox jumps over the lazy dog. 1234567890"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: '#0a0e14',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 16,
                  fontFamily: `'top-preview-font-${request.id}', sans-serif`,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>
        )}
        {activeTab === 'headers' && (
          <>
            {/* Researcher Notes Section */}
            {(request.notes && request.notes.trim() !== '') || showNotesInput ? (
              <div style={{
                marginBottom: 12,
                background: 'rgba(255, 170, 0, 0.05)',
                border: '1px solid rgba(255, 170, 0, 0.2)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-yellow)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', letterSpacing: '0.5px' }}>
                    <img 
                      src={chrome.runtime.getURL('icons/ui/notes.svg')} 
                      alt="Notes" 
                      style={{ width: 12, height: 12 }} 
                    />
                    Researcher Notes
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {notesSaved && (
                      <span style={{ fontSize: 10, color: 'var(--accent-green)', fontWeight: 700, fontFamily: 'var(--font-sans)' }}>
                        ✓ Auto-saved
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setShowNotesInput(false);
                        // If notes are empty, let's clear it completely so the button displays again!
                        if (!request.notes || request.notes.trim() === '') {
                          handleUpdateNotes('');
                        }
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--font-sans)', fontWeight: 600, padding: 0 }}
                      title="Hide/Minimize Notes Card"
                    >
                      ✕ Hide
                    </button>
                  </div>
                </div>
                <textarea
                  value={request.notes || ''}
                  onChange={(e) => handleUpdateNotes(e.target.value)}
                  placeholder="Type exploit notes, parameter findings, or custom vulnerabilities here... (auto-saved)"
                  style={{
                    width: '100%',
                    height: 64,
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: 12,
                    padding: '6px 10px',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    outline: 'none',
                    lineHeight: 1.4
                  }}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowNotesInput(true)}
                style={{
                  background: 'rgba(255, 170, 0, 0.03)',
                  border: '1px dashed rgba(255, 170, 0, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--accent-yellow)',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 12,
                  transition: 'all 0.15s ease',
                  boxSizing: 'border-box',
                  fontFamily: 'var(--font-sans)'
                }}
                className="add-notes-dashed-btn"
                title="Add security or pentesting notes to this request"
              >
                <img 
                  src={chrome.runtime.getURL('icons/ui/notes.svg')} 
                  alt="Notes" 
                  style={{ width: 12, height: 12, marginRight: 6 }} 
                />
                <span>Add Researcher Notes...</span>
              </button>
            )}

            <div style={{ 
              marginBottom: 12, 
              fontSize: 13, 
              fontFamily: 'var(--font-mono)',
              color: 'var(--accent-cyan)', 
              wordBreak: 'break-all',
              lineHeight: 1.45,
              background: 'rgba(0, 229, 255, 0.05)',
              border: '1px solid rgba(0, 229, 255, 0.15)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              userSelect: 'all',
              fontWeight: 500
            }}>
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
                          onClick={() => setDecodedB64Val(value as string)}
                          className="badge-btn-b64"
                          title="Decode Base64 inline"
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
                              setDecodedJwtVal(decodeJwt(token));
                            }}
                            className="badge-btn-jwt"
                            title="Decode JWT inline"
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
                            onClick={() => setDecodedB64Val(value as string)}
                            className="badge-btn-b64"
                            title="Decode Base64 inline"
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
                                setDecodedJwtVal(decodeJwt(token));
                              }}
                              className="badge-btn-jwt"
                              title="Decode JWT inline"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!(isImage || isFont) ? (
              <div className="detail-raw" style={{ flexShrink: 0 }}>
                {formatBody(request.responseBody) || '(no response body captured)'}
              </div>
            ) : (
              <div style={{ 
                fontSize: 10, 
                color: 'var(--text-muted)', 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px dashed var(--border-color)', 
                padding: '6px 10px', 
                borderRadius: 4,
                fontFamily: 'var(--font-mono)'
              }}>
                ℹ️ {request.responseBody || '[Response body discarded for static assets]'}
              </div>
            )}

            {/* LIVE PREVIEWS & UTILITIES */}
            {isImage && (
              <div className="live-preview-container" style={{
                padding: 16,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'rgba(0, 229, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                boxShadow: 'inset 0 0 12px rgba(0,229,255,0.05)'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🖼️ Live Image Preview</span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-cyan)' }}>Live Fetch</span>
                </div>
                <div style={{
                  position: 'relative',
                  padding: 8,
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  background: '#0a0e14',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 180,
                  width: '100%',
                  overflow: 'hidden'
                }}>
                  <img 
                    src={request.url} 
                    alt="Live preview" 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: 320, 
                      objectFit: 'contain',
                      borderRadius: 4
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        const errEl = document.createElement('div');
                        errEl.innerText = '⚠️ Live preview blocked (Authentication or CORS required)';
                        errEl.style.fontSize = '12px';
                        errEl.style.color = 'var(--accent-red)';
                        errEl.style.fontWeight = '700';
                        parent.appendChild(errEl);
                      }
                    }}
                  />
                </div>
                <a 
                  href={request.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 12,
                    color: 'var(--accent-cyan)',
                    textDecoration: 'none',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  Open Asset URL in New Tab ↗
                </a>
              </div>
            )}

            {isFont && (
              <div className="live-preview-container" style={{
                padding: 16,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'rgba(0, 229, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxShadow: 'inset 0 0 12px rgba(0,229,255,0.05)'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🔤 Dynamic Font Preview</span>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'rgba(0, 229, 255, 0.15)', color: 'var(--accent-cyan)' }}>Live Fetch</span>
                </div>
                <style dangerouslySetInnerHTML={{__html: `
                  @font-face {
                    font-family: 'preview-font-${request.id}';
                    src: url('${request.url}');
                  }
                `}} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Type to test this custom font live:</label>
                  <input 
                    type="text"
                    defaultValue="The quick brown fox jumps over the lazy dog. 1234567890"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: '#0a0e14',
                      border: '1px solid var(--border-color)',
                      borderRadius: 4,
                      color: '#fff',
                      fontSize: 16,
                      fontFamily: `'preview-font-${request.id}', sans-serif`,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            )}

            {isFetchableText && (
              <div className="live-preview-container" style={{
                padding: 16,
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'rgba(0, 229, 255, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxShadow: 'inset 0 0 12px rgba(0,229,255,0.05)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚡ Live Server Auditor</span>
                  </div>
                  {!liveContent && !loadingLive && (
                    <button
                      onClick={handleFetchLive}
                      style={{
                        background: 'var(--accent-cyan)',
                        border: 'none',
                        color: '#000',
                        padding: '4px 10px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      🚀 Fetch Live Content
                    </button>
                  )}
                </div>

                {loadingLive && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                    <div className="spinner-mini" style={{
                      width: 12,
                      height: 12,
                      border: '2px solid rgba(0,229,255,0.2)',
                      borderTop: '2px solid var(--accent-cyan)',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }} />
                    <span>Fetching fresh asset content directly from target server...</span>
                  </div>
                )}

                {liveError && (
                  <div style={{ color: 'var(--accent-red)', fontSize: 12, fontWeight: 700 }}>
                    ❌ {liveError}
                  </div>
                )}

                {liveContent !== null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Fetched {liveContent.length} bytes successfully</span>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(liveContent);
                          setModalCopied(true);
                          setTimeout(() => setModalCopied(false), 1200);
                        }}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {modalCopied ? '✅ Copied' : '📋 Copy Content'}
                      </button>
                    </div>
                    <pre className="detail-raw" style={{ 
                      maxHeight: 250, 
                      overflowY: 'auto', 
                      background: '#0a0e14', 
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {formatBody(liveContent)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Base64 Decoder Popup Modal */}
      {decodedB64Val !== null && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔍 Base64 Decoded Value
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  try {
                    const decoded = decodeBase64(decodedB64Val);
                    await navigator.clipboard.writeText(decoded);
                    setModalCopied(true);
                    setTimeout(() => setModalCopied(false), 1500);
                  } catch {}
                }}
                className="tool-btn-primary"
                style={{ fontSize: 11, padding: '3px 8px', background: modalCopied ? 'rgba(0, 255, 136, 0.1)' : 'transparent', color: modalCopied ? 'var(--accent-green)' : 'var(--text-primary)', border: modalCopied ? '1px solid var(--accent-green)' : '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer' }}
              >
                {modalCopied ? '✓ Copied' : '📋 Copy'}
              </button>
              <button
                onClick={() => setDecodedB64Val(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-darker)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {decodeBase64(decodedB64Val)}
          </div>
        </div>
      )}

      {/* JWT Decoder Popup Modal */}
      {decodedJwtVal !== null && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(10, 14, 20, 0.95)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#ff3366', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔑 JWT Decoded Payload
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  try {
                    const tokenText = JSON.stringify({
                      header: JSON.parse(decodedJwtVal.header),
                      payload: JSON.parse(decodedJwtVal.payload)
                    }, null, 2);
                    await navigator.clipboard.writeText(tokenText);
                    setModalCopied(true);
                    setTimeout(() => setModalCopied(false), 1500);
                  } catch {
                    await navigator.clipboard.writeText(`${decodedJwtVal.header}\n\n${decodedJwtVal.payload}`);
                    setModalCopied(true);
                    setTimeout(() => setModalCopied(false), 1500);
                  }
                }}
                className="tool-btn-primary"
                style={{ fontSize: 11, padding: '3px 8px', background: modalCopied ? 'rgba(0, 255, 136, 0.1)' : 'transparent', color: modalCopied ? 'var(--accent-green)' : 'var(--text-primary)', border: modalCopied ? '1px solid var(--accent-green)' : '1px solid var(--border-primary)', borderRadius: 4, cursor: 'pointer' }}
              >
                {modalCopied ? '✓ Copied' : '📋 Copy All'}
              </button>
              <button
                onClick={() => setDecodedJwtVal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
            {decodedJwtVal.error ? (
              <div style={{ color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                ⚠️ {decodedJwtVal.error}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#ff3366', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Header</div>
                  <pre style={{ flex: 1, margin: 0, overflow: 'auto', background: 'var(--bg-darker)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#ff3366' }}>
                    {decodedJwtVal.header}
                  </pre>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1.5 }}>
                  <div style={{ fontSize: 11, color: 'var(--accent-cyan)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Payload / Claims</div>
                  <pre style={{ flex: 1, margin: 0, overflow: 'auto', background: 'var(--bg-darker)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--accent-cyan)' }}>
                    {decodedJwtVal.payload}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
