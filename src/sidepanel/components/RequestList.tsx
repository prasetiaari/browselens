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

interface Props {
  requests: CapturedRequest[];
  selected: CapturedRequest | null;
  selectedList?: CapturedRequest[];
  onSelect: (req: CapturedRequest) => void;
}

export default function RequestList({ requests, selected, selectedList, onSelect }: Props) {
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
        const isSelected = selected?.id === req.id || idxInCompare >= 0;
        const compareClass = idxInCompare === 0 ? 'compare-a' : idxInCompare === 1 ? 'compare-b' : '';
        
        return (
          <div
            key={req.id}
            className={`request-item ${isSelected ? 'selected' : ''} ${compareClass} ${req.tag && req.tag !== 'none' ? 'tag-' + req.tag : ''}`}
            onClick={() => onSelect(req)}
          >
          <span className="request-time">
            {formatTime(req.timestamp)}
          </span>
          <span className={`request-method ${req.method}`}>
            {req.method}
          </span>
          <span className="request-url" title={req.url}>
            {req.vulnerabilities && req.vulnerabilities.length > 0 && (
              <span style={{ marginRight: 4 }} title={`${req.vulnerabilities.length} security warnings detected`}>🚨</span>
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
