import type { CapturedRequest } from '../../shared/types';

function getStatusClass(status?: number): string {
  if (!status) return '';
  if (status >= 200 && status < 300) return 's2xx';
  if (status >= 300 && status < 400) return 's3xx';
  if (status >= 400 && status < 500) return 's4xx';
  return 's5xx';
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

// Hash function removed, using real shortId now

interface Props {
  requests: CapturedRequest[];
  selected: CapturedRequest | null;
  selectedList?: CapturedRequest[];
  onSelect: (req: CapturedRequest) => void;
  selectMode?: boolean;
  selectedIds?: string[];
}

export default function RequestList({ requests, selected, selectedList, onSelect, selectMode = false, selectedIds = [] }: Props) {
  if (requests.length === 0) {
    return (
      <div className="request-list-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <p>
          No requests captured yet.<br />
          Open DevTools (F12) and browse a website<br />
          to start intercepting HTTP traffic.
        </p>
      </div>
    );
  }

  return (
    <div className="request-list">
      {requests.map(req => {
        const idxInCompare = selectedList ? selectedList.findIndex(r => r.id === req.id) : -1;
        const isSelected = (selectMode && selectedIds.includes(req.id)) || (!selectMode && selected?.id === req.id) || idxInCompare >= 0;
        const compareClass = idxInCompare === 0 ? 'compare-a' : idxInCompare === 1 ? 'compare-b' : '';
        
        return (
          <div
            key={req.id}
            className={`request-item ${isSelected ? 'selected' : ''} ${compareClass} ${req.tag && req.tag !== 'none' ? 'tag-' + req.tag : ''}`}
            onClick={() => onSelect(req)}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            {selectMode && (
              <input
                type="checkbox"
                checked={selectedIds.includes(req.id)}
                onChange={() => {}}
                style={{
                  marginRight: 8,
                  marginLeft: 4,
                  cursor: 'pointer',
                  accentColor: 'var(--accent-cyan)',
                  flexShrink: 0
                }}
              />
            )}
            <span className="request-time" style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>
                #{req.shortId}
              </span>
              <span>{formatTime(req.timestamp)}</span>
            </span>
          <span className={`request-method ${req.method}`}>
            {req.method}
          </span>
          <span className="request-url" title={req.url}>
            {req.vulnerabilities && req.vulnerabilities.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }} title={`${req.vulnerabilities.length} security warnings detected`}>
                <img 
                  src={chrome.runtime.getURL('icons/ui/warning.svg')} 
                  alt="Warning" 
                  style={{ width: 12, height: 12, filter: 'drop-shadow(0 0 3px rgba(255, 51, 102, 0.6))' }} 
                />
              </span>
            )}
            {req.notes && req.notes.trim() !== '' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 6 }} title="Contains researcher notes">
                <img 
                  src={chrome.runtime.getURL('icons/ui/notes.svg')} 
                  alt="Notes" 
                  style={{ width: 11, height: 11, filter: 'drop-shadow(0 0 3px rgba(255, 170, 0, 0.6))' }} 
                />
              </span>
            )}
            {getPath(req.url)}
          </span>
          <span className={`request-status ${getStatusClass(req.status)}`}>
            {req.status || '—'}
          </span>
          <span className="request-duration">
            {formatDuration(req.duration)}
          </span>
          </div>
        );
      })}
    </div>
  );
}
