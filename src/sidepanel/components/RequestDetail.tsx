import { useState } from 'react';
import type { CapturedRequest } from '../../shared/types';

type DetailTab = 'headers' | 'body' | 'response';

interface Props {
  request: CapturedRequest;
  onSendToRepeater: (req: CapturedRequest) => void;
  onAskAI: (req: CapturedRequest) => void;
  onClose: () => void;
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

export default function RequestDetail({ request, onSendToRepeater, onAskAI, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<DetailTab>('headers');

  return (
    <div className="request-detail">
      <div className="detail-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`request-method ${request.method}`} style={{ fontSize: 10 }}>
            {request.method}
          </span>
          <span className={`request-status ${getStatusClass(request.status)}`}>
            {request.status}
          </span>
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
          <button className="detail-action-btn" onClick={() => onSendToRepeater(request)}>
            ↗ Send to Repeater
          </button>
          <button className="detail-action-btn" onClick={() => onAskAI(request)}>
            🤖 Ask AI
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
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>
                Request Headers
              </div>
              <div className="detail-kv">
                {Object.entries(request.requestHeaders).map(([key, value]) => (
                  <div key={key} style={{ display: 'contents' }}>
                    <span className="detail-key">{key}</span>
                    <span className="detail-value">{value as string}</span>
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
                      <span className="detail-value">{value as string}</span>
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
