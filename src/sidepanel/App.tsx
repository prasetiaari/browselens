import { useState, useEffect, useCallback } from 'react';
import type { CapturedRequest, ExtensionSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import RequestList from './components/RequestList';
import RequestDetail from './components/RequestDetail';
import RequestDiff from './components/RequestDiff';
import Repeater from './components/Repeater';
import ChatPanel from './components/ChatPanel';
import Settings from './components/Settings';
import ToolsPanel from './components/ToolsPanel';

type MainTab = 'network' | 'chat' | 'tools' | 'settings';
type NetworkSubTab = 'history' | 'requester';

export default function App() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('network');
  const [activeNetworkTab, setActiveNetworkTab] = useState<NetworkSubTab>('history');
  
  // Tools bridging states
  const [toolsInitialTab, setToolsInitialTab] = useState<'base64' | 'jwt'>('base64');
  const [toolsInitialBase64Text, setToolsInitialBase64Text] = useState('');
  const [toolsInitialJwtText, setToolsInitialJwtText] = useState('');
  
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CapturedRequest | null>(null);
  
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<CapturedRequest[]>([]);
  
  const [repeaterRequest, setRepeaterRequest] = useState<{
    method: string; url: string; headers: string; body: string;
  } | null>(null);
  
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [filter, setFilter] = useState('');
  
  // Project Management States
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Advanced filters
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [filterScheme, setFilterScheme] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDomain, setFilterDomain] = useState('');

  // Custom Dropdown UI States
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [showSchemeDropdown, setShowSchemeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  // Load initial requests and settings
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.settings) {
        setSettings(response.settings);
        // Initialize requests matching the current active project partition
        chrome.runtime.sendMessage({ 
          type: 'SWITCH_PROJECT', 
          payload: { projectId: response.settings.currentProjectId || 'default' } 
        }, (res) => {
          if (res?.requests) setRequests(res.requests);
        });
      } else {
        // Fallback to old behavior if settings aren't stored
        chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (res) => {
          if (res?.requests) setRequests(res.requests);
        });
      }
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

        setSelectedRequest(prev => {
          if (prev && prev.id === message.payload.id) {
            return { ...prev, ...message.payload };
          }
          return prev;
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

  const handleAskAI = useCallback((prompt: string) => {
    setActiveMainTab('chat');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ai-trigger-prompt', { detail: { prompt } }));
    }, 100);
  }, []);

  const handleSendToBase64 = useCallback((text: string) => {
    setToolsInitialBase64Text(text);
    setToolsInitialTab('base64');
    setActiveMainTab('tools');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tools-trigger-base64', { detail: { text } }));
    }, 50);
  }, []);

  const handleSendToJwt = useCallback((text: string) => {
    setToolsInitialJwtText(text);
    setToolsInitialTab('jwt');
    setActiveMainTab('tools');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tools-trigger-jwt', { detail: { text } }));
    }, 50);
  }, []);

  const handleSelectRequest = useCallback((req: CapturedRequest) => {
    if (compareMode) {
      setSelectedForCompare(prev => {
        const exists = prev.some(r => r.id === req.id);
        if (exists) {
          return prev.filter(r => r.id !== req.id);
        }
        if (prev.length >= 2) {
          return [prev[0], req];
        }
        return [...prev, req];
      });
    } else {
      setSelectedRequest(req);
    }
  }, [compareMode]);

  const handleClearRequests = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' });
    setRequests([]);
    setSelectedRequest(null);
  }, []);

  const handleExportSession = useCallback(() => {
    const dataStr = JSON.stringify(requests, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `browselens-session-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [requests]);

  const handleImportSession = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target?.result as string);
        if (Array.isArray(imported)) {
          chrome.runtime.sendMessage({ type: 'SET_REQUESTS', payload: imported }, (response) => {
            if (response?.success) {
              setRequests(imported);
              setSelectedRequest(null);
            }
          });
        } else {
          alert('Invalid session file format (must be JSON array).');
        }
      } catch (err) {
        alert('Failed to parse session file: ' + err);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleSwitchProject = useCallback((projectId: string) => {
    chrome.runtime.sendMessage({ type: 'SWITCH_PROJECT', payload: { projectId } }, (response) => {
      if (response?.success) {
        setSettings(prev => ({
          ...prev,
          currentProjectId: projectId,
        }));
        setRequests(response.requests || []);
        setSelectedRequest(null);
        setSelectedForCompare([]);
      }
    });
  }, []);

  const handleCreateProject = useCallback((name: string) => {
    if (!name.trim()) return;
    const newProject = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name: name.trim(),
      createdAt: Date.now(),
      targetScope: '',
      customHeaders: [],
    };

    const updatedSettings = {
      ...settings,
      projects: [...(settings.projects || []), newProject],
      currentProjectId: newProject.id,
    };

    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: updatedSettings }, (response) => {
      if (response?.success) {
        setSettings(updatedSettings);
        handleSwitchProject(newProject.id);
        setShowNewProjectModal(false);
        setNewProjectName('');
      }
    });
  }, [settings, handleSwitchProject]);

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
      {/* Project Selector Bar */}
      <div className="project-bar">
        <div className="project-selector-wrapper">
          <span className="project-label">📁 Project:</span>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: 11,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{(settings.projects || []).find(p => p.id === (settings.currentProjectId || 'default'))?.name || 'Default Project'}</span>
              <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>▼</span>
            </button>
            {showProjectDropdown && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                zIndex: 100000,
                minWidth: 150,
                overflow: 'hidden'
              }}>
                {(settings.projects || []).map(p => (
                  <div
                    key={p.id}
                    onClick={() => {
                      handleSwitchProject(p.id);
                      setShowProjectDropdown(false);
                    }}
                    style={{
                      padding: '8px 12px',
                      fontSize: 11,
                      cursor: 'pointer',
                      color: settings.currentProjectId === p.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                      background: settings.currentProjectId === p.id ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = settings.currentProjectId === p.id ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                  >
                    📁 {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <button className="add-project-btn" onClick={() => setShowNewProjectModal(true)} title="Create New Project">
          ➕ New Project
        </button>
      </div>

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
          <input
            type="file"
            id="import-session-file"
            style={{ display: 'none' }}
            onChange={handleImportSession}
            accept=".json"
          />
          <button className="icon-btn" onClick={() => document.getElementById('import-session-file')?.click()} title="Import Session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={handleExportSession} title="Export Session">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={handleClearRequests} title="Clear requests">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3,6 5,6 21,6" />
              <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              chrome.windows.create({
                url: chrome.runtime.getURL('src/sidepanel/index.html'),
                type: 'popup',
                width: 1200,
                height: 800
              });
            }}
            title="Open Standalone App Window (Full Screen)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
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
          <button
            className={`tab-btn ${activeMainTab === 'tools' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('tools')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            Tools
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        {activeMainTab === 'settings' && (
          <Settings settings={settings} onSave={setSettings} />
        )}
        
        <div style={{ display: activeMainTab === 'network' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
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
            <div style={{ display: activeNetworkTab === 'history' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
              
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
                  <span style={{ color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'nowrap', marginRight: 6 }}>
                    {filteredRequests.length}/{requests.length}
                  </span>
                )}
                <button
                  className={`filter-chip ${compareMode ? 'active' : ''}`}
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedForCompare([]);
                    setSelectedRequest(null);
                  }}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    borderRadius: 4,
                    border: '1px solid var(--border-color)',
                    background: compareMode ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    color: compareMode ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    borderColor: compareMode ? 'var(--accent-cyan)' : 'var(--border-color)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  ⚔️ Compare
                </button>
              </div>

              {/* ADVANCED FILTER BAR */}
              <div className="filter-options" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                
                {/* 1. Method Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => {
                      setShowMethodDropdown(!showMethodDropdown);
                      setShowSchemeDropdown(false);
                      setShowStatusDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                      height: 22,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Method: {filterMethod === 'ALL' ? 'All' : filterMethod}</span>
                    <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>▼</span>
                  </button>
                  {showMethodDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      zIndex: 100000,
                      minWidth: 110,
                      overflow: 'hidden'
                    }}>
                      {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map(m => (
                        <div
                          key={m}
                          onClick={() => {
                            setFilterMethod(m);
                            setShowMethodDropdown(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: 10,
                            cursor: 'pointer',
                            color: filterMethod === m ? 'var(--accent-cyan)' : 'var(--text-primary)',
                            background: filterMethod === m ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = filterMethod === m ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                        >
                          {m === 'ALL' ? 'All' : m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Scheme Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => {
                      setShowSchemeDropdown(!showSchemeDropdown);
                      setShowMethodDropdown(false);
                      setShowStatusDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                      height: 22,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Scheme: {filterScheme === 'ALL' ? 'All' : filterScheme}</span>
                    <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>▼</span>
                  </button>
                  {showSchemeDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      zIndex: 100000,
                      minWidth: 110,
                      overflow: 'hidden'
                    }}>
                      {['ALL', 'HTTP', 'HTTPS'].map(s => (
                        <div
                          key={s}
                          onClick={() => {
                            setFilterScheme(s);
                            setShowSchemeDropdown(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: 10,
                            cursor: 'pointer',
                            color: filterScheme === s ? 'var(--accent-cyan)' : 'var(--text-primary)',
                            background: filterScheme === s ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = filterScheme === s ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                        >
                          {s === 'ALL' ? 'All' : s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Status Dropdown */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => {
                      setShowStatusDropdown(!showStatusDropdown);
                      setShowMethodDropdown(false);
                      setShowSchemeDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 10,
                      padding: '4px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 600,
                      height: 22,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Status: {filterStatus === 'ALL' ? 'All' : filterStatus}</span>
                    <span style={{ fontSize: 7, color: 'var(--text-muted)' }}>▼</span>
                  </button>
                  {showStatusDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      zIndex: 100000,
                      minWidth: 130,
                      overflow: 'hidden'
                    }}>
                      {[
                        { value: 'ALL', label: 'All Statuses' },
                        { value: '2XX', label: '2xx Success' },
                        { value: '3XX', label: '3xx Redirection' },
                        { value: '4XX', label: '4xx Client Error' },
                        { value: '5XX', label: '5xx Server Error' }
                      ].map(st => (
                        <div
                          key={st.value}
                          onClick={() => {
                            setFilterStatus(st.value);
                            setShowStatusDropdown(false);
                          }}
                          style={{
                            padding: '6px 10px',
                            fontSize: 10,
                            cursor: 'pointer',
                            color: filterStatus === st.value ? 'var(--accent-cyan)' : 'var(--text-primary)',
                            background: filterStatus === st.value ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                          onMouseLeave={e => e.currentTarget.style.background = filterStatus === st.value ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                        >
                          {st.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
                    selectedList={selectedForCompare}
                    onSelect={handleSelectRequest}
                  />
                </div>
                
                {compareMode ? (
                  selectedForCompare.length === 2 ? (
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <RequestDiff
                        requestA={selectedForCompare[0]}
                        requestB={selectedForCompare[1]}
                        onClose={() => setSelectedForCompare([])}
                      />
                    </div>
                  ) : (
                    <div style={{
                      padding: 12,
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      background: 'var(--bg-light)',
                      borderTop: '1px solid var(--border-color)'
                    }}>
                      ⚔️ Compare Mode Active. Select <b>{2 - selectedForCompare.length}</b> more request{2 - selectedForCompare.length > 1 ? 's' : ''} from history to compare.
                    </div>
                  )
                ) : (
                  selectedRequest && (
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <RequestDetail
                        request={selectedRequest}
                        onSendToRepeater={handleSendToRepeater}
                        onAskAI={handleAskAI}
                        onClose={() => setSelectedRequest(null)}
                        onSendToBase64={handleSendToBase64}
                        onSendToJwt={handleSendToJwt}
                      />
                    </div>
                  )
                )}
              </div>
            </div>

            <div style={{ display: activeNetworkTab === 'requester' ? 'block' : 'none', height: '100%' }}>
              <Repeater initialRequest={repeaterRequest} />
            </div>
          </div>
        </div>
        
        <div style={{ display: activeMainTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <ChatPanel />
        </div>

        <div style={{ display: activeMainTab === 'tools' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <ToolsPanel initialTab={toolsInitialTab} initialBase64={toolsInitialBase64Text} initialJwt={toolsInitialJwtText} />
        </div>
      </div>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>➕ Create New Project</h3>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
              Organize request history, scope filters, and auth header injection separately.
            </p>
            <input
              type="text"
              className="modal-input"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="e.g. HackerOne - Zooplus"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject(newProjectName);
                if (e.key === 'Escape') setShowNewProjectModal(false);
              }}
            />
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowNewProjectModal(false)}>
                Cancel
              </button>
              <button className="modal-btn confirm" onClick={() => handleCreateProject(newProjectName)}>
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
