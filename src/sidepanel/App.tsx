import { useState, useEffect, useCallback } from 'react';
import type { CapturedRequest, ExtensionSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import RequestList from './components/RequestList';
import RequestDetail from './components/RequestDetail';
import Repeater from './components/Repeater';
import ChatPanel from './components/ChatPanel';
import Settings from './components/Settings';

type MainTab = 'network' | 'chat' | 'settings';
type NetworkSubTab = 'history' | 'requester';

export default function App() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('network');
  const [activeNetworkTab, setActiveNetworkTab] = useState<NetworkSubTab>('history');
  
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CapturedRequest | null>(null);
  
  const [repeaterRequest, setRepeaterRequest] = useState<{
    method: string; url: string; headers: string; body: string;
  } | null>(null);
  
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [filter, setFilter] = useState('');
  
  // Advanced filters
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [filterScheme, setFilterScheme] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDomain, setFilterDomain] = useState('');

  // Load initial requests and settings
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (response) => {
      if (response?.requests) setRequests(response.requests);
    });
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.settings) setSettings(response.settings);
    });
  }, []);

  // Listen for new requests from service worker
  useEffect(() => {
    const listener = (message: { type: string; payload: CapturedRequest }) => {
      if (message.type === 'REQUEST_CAPTURED') {
        setRequests(prev => {
          const existing = prev.findIndex(r => r.id === message.payload.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...message.payload };
            return updated;
          }
          return [...prev, message.payload];
        });
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSendToRepeater = useCallback((req: CapturedRequest) => {
    setRepeaterRequest({
      method: req.method,
      url: req.url,
      headers: JSON.stringify(req.requestHeaders, null, 2),
      body: req.requestBody || '',
    });
    setActiveNetworkTab('requester');
  }, []);

  const handleAskAI = useCallback((_req: CapturedRequest) => {
    setActiveMainTab('chat');
  }, []);

  const handleClearRequests = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' });
    setRequests([]);
    setSelectedRequest(null);
  }, []);

  const filteredRequests = requests.filter(r => {
    if (!r) return false;
    
    // 1. Text Search (URL & Headers)
    if (filter) {
      try {
        const f = filter.toLowerCase();
        const urlStr = r.url ? String(r.url).toLowerCase() : '';
        const inUrl = urlStr.includes(f);
        
        let inHeaders = false;
        if (r.requestHeaders && typeof r.requestHeaders === 'object') {
          inHeaders = inHeaders || Object.entries(r.requestHeaders).some(([k,v]) => 
            String(k).toLowerCase().includes(f) || String(v).toLowerCase().includes(f)
          );
        }
        if (r.responseHeaders && typeof r.responseHeaders === 'object') {
          inHeaders = inHeaders || Object.entries(r.responseHeaders).some(([k,v]) => 
            String(k).toLowerCase().includes(f) || String(v).toLowerCase().includes(f)
          );
        }
        
        if (!inUrl && !inHeaders) return false;
      } catch (err) {
        console.error('Filter search error', err);
        return false; // Skip if it causes an error
      }
    }

    // 2. Method
    if (filterMethod !== 'ALL' && r.method !== filterMethod) return false;

    // 3. Scheme
    if (filterScheme !== 'ALL') {
      const urlStr = r.url ? String(r.url).toLowerCase() : '';
      const isHttps = urlStr.startsWith('https://');
      if (filterScheme === 'HTTPS' && !isHttps) return false;
      if (filterScheme === 'HTTP' && isHttps) return false;
    }

    // 4. Status
    if (filterStatus !== 'ALL') {
      const s = r.status || 0;
      if (filterStatus === '2XX' && (s < 200 || s >= 300)) return false;
      if (filterStatus === '3XX' && (s < 300 || s >= 400)) return false;
      if (filterStatus === '4XX' && (s < 400 || s >= 500)) return false;
      if (filterStatus === '5XX' && (s < 500 || s >= 600)) return false;
    }

    // 5. Domain
    if (filterDomain) {
      try {
        const urlStr = r.url ? String(r.url) : '';
        const urlObj = new URL(urlStr);
        if (!urlObj.hostname.toLowerCase().includes(filterDomain.toLowerCase())) return false;
      } catch {
        const urlStr = r.url ? String(r.url).toLowerCase() : '';
        if (!urlStr.includes(filterDomain.toLowerCase())) return false;
      }
    }

    return true;
  });

  return (
    <div className="app">
      {/* Header */}
      <div className="header">
        <div className="header-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round">
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00e5ff" />
                <stop offset="100%" stopColor="#00ff88" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
          <span>BrowseLens</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={handleClearRequests} title="Clear requests">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
            </svg>
          </button>
          <button
            className={`icon-btn ${activeMainTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveMainTab(activeMainTab === 'settings' ? 'network' : 'settings')}
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12,1V4M12,20v3M4.22,4.22l2.12,2.12M17.66,17.66l2.12,2.12M1,12H4M20,12h3M4.22,19.78l2.12-2.12M17.66,6.34l2.12-2.12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation */}
      {activeMainTab !== 'settings' && (
        <div className="tab-nav">
          <button
            className={`tab-btn ${activeMainTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('network')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Network
            {requests.length > 0 && <span className="tab-badge">{requests.length}</span>}
          </button>
          <button
            className={`tab-btn ${activeMainTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('chat')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12,2A10,10,0,0,0,2,12a10,10,0,0,0,1.1,4.5L2,22l5.5-1.1A10,10,0,1,0,12,2Z" />
            </svg>
            AI Chat
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {activeMainTab === 'settings' && (
          <Settings settings={settings} onSave={setSettings} />
        )}
        
        {activeMainTab === 'network' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Sub Tab Navigation for Network */}
            <div className="sub-tab-nav">
              <button 
                className={`sub-tab-btn ${activeNetworkTab === 'history' ? 'active' : ''}`}
                onClick={() => setActiveNetworkTab('history')}
              >
                Requests History
              </button>
              <button 
                className={`sub-tab-btn ${activeNetworkTab === 'requester' ? 'active' : ''}`}
                onClick={() => setActiveNetworkTab('requester')}
              >
                Requester
              </button>
            </div>

            {/* Network Sub-Tab Content */}
            <div className="sub-tab-content">
              {activeNetworkTab === 'history' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  
                  {/* SEARCH BAR */}
                  <div className="filter-bar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      className="filter-input"
                      placeholder="Search URL or headers..."
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                    />
                    {requests.length > 0 && (
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>
                        {filteredRequests.length}/{requests.length}
                      </span>
                    )}
                  </div>

                  {/* ADVANCED FILTER BAR */}
                  <div className="filter-options">
                    <select 
                      className="filter-select" 
                      value={filterMethod} 
                      onChange={e => setFilterMethod(e.target.value)}
                    >
                      <option value="ALL">Method: All</option>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="PATCH">PATCH</option>
                      <option value="DELETE">DELETE</option>
                      <option value="OPTIONS">OPTIONS</option>
                    </select>

                    <select 
                      className="filter-select" 
                      value={filterScheme} 
                      onChange={e => setFilterScheme(e.target.value)}
                    >
                      <option value="ALL">Scheme: All</option>
                      <option value="HTTP">HTTP</option>
                      <option value="HTTPS">HTTPS</option>
                    </select>

                    <select 
                      className="filter-select" 
                      value={filterStatus} 
                      onChange={e => setFilterStatus(e.target.value)}
                    >
                      <option value="ALL">Status: All</option>
                      <option value="2XX">2xx Success</option>
                      <option value="3XX">3xx Redirection</option>
                      <option value="4XX">4xx Client Error</option>
                      <option value="5XX">5xx Server Error</option>
                    </select>

                    <input
                      className="filter-domain-input"
                      placeholder="Domain/Subdomain..."
                      value={filterDomain}
                      onChange={e => setFilterDomain(e.target.value)}
                    />
                  </div>

                  {/* LIST & DETAIL */}
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <RequestList
                        requests={filteredRequests}
                        selected={selectedRequest}
                        onSelect={setSelectedRequest}
                      />
                    </div>
                    
                    {selectedRequest && (
                      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <RequestDetail
                          request={selectedRequest}
                          onSendToRepeater={handleSendToRepeater}
                          onAskAI={handleAskAI}
                          onClose={() => setSelectedRequest(null)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeNetworkTab === 'requester' && (
                <Repeater initialRequest={repeaterRequest} />
              )}
            </div>
          </div>
        )}
        
        {activeMainTab === 'chat' && (
          <ChatPanel />
        )}
      </div>
    </div>
  );
}
