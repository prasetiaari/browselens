import { useState } from 'react';
import type { CapturedRequest } from '../../shared/types';

interface Props {
  requestA: CapturedRequest;
  requestB: CapturedRequest;
  onClose: () => void;
}

export default function RequestDiff({ requestA, requestB, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'headers' | 'body'>('headers');

  // Compare Headers
  const keysA = Object.keys(requestA.requestHeaders || {});
  const keysB = Object.keys(requestB.requestHeaders || {});
  const allHeaderKeys = Array.from(new Set([...keysA, ...keysB])).sort();

  return (
    <div className="request-detail" style={{ borderTop: '2px solid var(--accent-cyan)' }}>
      <div className="detail-header" style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
          <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>⚔️ COMPARE MODE</span>
          
          <div style={{ display: 'flex', gap: 6, flex: 1, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--accent-red)' }}>A: {requestA.method} {requestA.url.substring(0, 30)}...</span>
            <span style={{ color: 'var(--text-muted)' }}>vs</span>
            <span style={{ color: 'var(--accent-green)' }}>B: {requestB.method} {requestB.url.substring(0, 30)}...</span>
          </div>

          <button className="icon-btn" onClick={onClose} title="Close comparison" style={{ marginLeft: 'auto' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="detail-tabs" style={{ marginTop: 8 }}>
          <button
            className={`detail-tab ${activeTab === 'headers' ? 'active' : ''}`}
            onClick={() => setActiveTab('headers')}
          >
            Headers Diff
          </button>
          <button
            className={`detail-tab ${activeTab === 'body' ? 'active' : ''}`}
            onClick={() => setActiveTab('body')}
          >
            Body Diff
          </button>
        </div>
      </div>

      <div className="detail-body" style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'headers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 6 }}>
              <div style={{ fontWeight: 'bold', fontSize: 10, color: 'var(--accent-red)' }}>REQUEST A</div>
              <div style={{ fontWeight: 'bold', fontSize: 10, color: 'var(--accent-green)' }}>REQUEST B</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allHeaderKeys.map(key => {
                const valA = requestA.requestHeaders?.[key];
                const valB = requestB.requestHeaders?.[key];

                let rowBg = 'transparent';
                let colorA = 'var(--text-primary)';
                let colorB = 'var(--text-primary)';

                if (valA !== undefined && valB === undefined) {
                  // Only in A (Removed in B)
                  rowBg = 'rgba(255, 68, 68, 0.08)';
                  colorA = 'var(--accent-red)';
                  colorB = 'transparent';
                } else if (valA === undefined && valB !== undefined) {
                  // Only in B (Added in B)
                  rowBg = 'rgba(0, 255, 136, 0.08)';
                  colorA = 'transparent';
                  colorB = 'var(--accent-green)';
                } else if (valA !== valB) {
                  // Value differs
                  rowBg = 'rgba(255, 170, 0, 0.08)';
                  colorA = 'var(--accent-yellow)';
                  colorB = 'var(--accent-yellow)';
                }

                return (
                  <div key={key} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    background: rowBg,
                    padding: '4px 6px',
                    borderRadius: 4,
                    fontSize: 10,
                    wordBreak: 'break-all'
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, color: colorA }}>{key}:</span>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{valA || '—'}</span>
                    </div>
                    <div>
                      <span style={{ fontWeight: 600, color: colorB }}>{key}:</span>{' '}
                      <span style={{ color: 'var(--text-secondary)' }}>{valB || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 120 }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 10, color: 'var(--accent-red)', marginBottom: 6 }}>REQUEST A BODY</div>
              <pre style={{
                background: 'var(--bg-light)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 8,
                fontSize: 9,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
                overflowY: 'auto',
                maxHeight: 250
              }}>
                {requestA.requestBody || '(no body)'}
              </pre>
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 10, color: 'var(--accent-green)', marginBottom: 6 }}>REQUEST B BODY</div>
              <pre style={{
                background: 'var(--bg-light)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                padding: 8,
                fontSize: 9,
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
                overflowY: 'auto',
                maxHeight: 250
              }}>
                {requestB.requestBody || '(no body)'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
