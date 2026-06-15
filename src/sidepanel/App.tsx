import { useState, useEffect, useCallback, useMemo } from 'react';
import type { CapturedRequest, ExtensionSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import RequestList from './components/RequestList';
import RequestDetail from './components/RequestDetail';
import RequestDiff from './components/RequestDiff';
import Repeater from './components/Repeater';
import ChatPanel from './components/ChatPanel';
import Settings from './components/Settings';
import ToolsPanel from './components/ToolsPanel';
import MemoryManagerPanel from './components/MemoryManagerPanel';

type MainTab = 'network' | 'chat' | 'tools' | 'settings' | 'memory';
type NetworkSubTab = 'history' | 'tagged' | 'requester';

export default function App() {
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('network');
  const [activeNetworkTab, setActiveNetworkTab] = useState<NetworkSubTab>('history');
  
  // Tools bridging states
  const [toolsInitialTab, setToolsInitialTab] = useState<'base64' | 'jwt' | null>(null);
  const [toolsInitialBase64Text, setToolsInitialBase64Text] = useState('');
  const [toolsInitialJwtText, setToolsInitialJwtText] = useState('');
  
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CapturedRequest | null>(null);
  
  // Resizable bottom pane state
  const [detailPaneHeight, setDetailPaneHeight] = useState(300);
  const [isDraggingDetail, setIsDraggingDetail] = useState(false);
  
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
  const [filterDomains, setFilterDomains] = useState<string[]>([]);

  // Multi-select bulk actions
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Custom Dropdown UI States
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showMethodDropdown, setShowMethodDropdown] = useState(false);
  const [showSchemeDropdown, setShowSchemeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDomainDropdown, setShowDomainDropdown] = useState(false);

  // Search Configuration States
  const [showSearchConfig, setShowSearchConfig] = useState(false);
  const [searchConfig, setSearchConfig] = useState({
    urlAndMethod: true,
    headers: true,
    requestBody: false,
    responseBody: false,
  });

  const handleSendToBase64 = useCallback((text: string, action?: 'decode' | 'encode') => {
    setToolsInitialBase64Text(text);
    setToolsInitialTab('base64');
    setActiveMainTab('tools');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('tools-trigger-base64', { detail: { text, action } }));
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

  // Load initial requests and settings
  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
      if (response?.settings) {
        setSettings(response.settings);
        
        // Auto-attach to the current tab when the UI opens if capture is enabled
        if (response.settings.capture?.enabled) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].id) {
              chrome.runtime.sendMessage({ type: 'ATTACH_TO_TAB', payload: { tabId: tabs[0].id } });
            }
          });
        }
      }
      chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (res) => {
        if (res?.requests) setRequests(res.requests);
      });
    });
  }, []);

  const handleAskAI = useCallback((prompt: string) => {
    setActiveMainTab('chat');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('ai-trigger-prompt', { detail: { prompt } }));
    }, 100);
  }, []);

  // Listen for new requests from service worker
  useEffect(() => {
    const listener = (message: { type: string; payload: any }) => {
      if (message.type === 'REQUEST_CAPTURED') {
        setRequests(prev => {
          const existing = prev.findIndex(r => r.id === message.payload.id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], ...message.payload };
            return updated;
          }
          const historyLimit = settings.capture?.maxHistoryLimit || 1000;
          const newList = [...prev, message.payload];
          if (newList.length > historyLimit) {
            return newList.slice(-historyLimit);
          }
          return newList;
        });

        setSelectedRequest(prev => {
          if (prev && prev.id === message.payload.id) {
            return { ...prev, ...message.payload };
          }
          return prev;
        });
      } else if (message.type === 'REQUEST_DELETED') {
        const { id } = message.payload;
        setRequests(prev => prev.filter(r => r.id !== id));
        setSelectedRequest(prev => prev && prev.id === id ? null : prev);
      } else if (message.type === 'FILTERED_REQUESTS_DELETED') {
        const { ids } = message.payload;
        setRequests(prev => prev.filter(r => !ids.includes(r.id)));
        setSelectedRequest(prev => prev && ids.includes(prev.id) ? null : prev);
      } else if (message.type === 'TRIGGER_BASE64_DECODE') {
        handleSendToBase64(message.payload.text, 'decode');
      } else if (message.type === 'TRIGGER_BASE64_ENCODE') {
        handleSendToBase64(message.payload.text, 'encode');
      } else if (message.type === 'TRIGGER_JWT_DECODE') {
        handleSendToJwt(message.payload.text);
      } else if (message.type === 'TRIGGER_ASK_AI') {
        handleAskAI(message.payload.prompt);
      } else if (message.type === 'SEND_TO_REPEATER') {
        setRepeaterRequest({
          method: message.payload.method,
          url: message.payload.url,
          headers: JSON.stringify(message.payload.headers, null, 2),
          body: message.payload.body || '',
        });
        setActiveNetworkTab('requester');
        setActiveMainTab('network');
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [handleSendToBase64, handleSendToJwt, handleAskAI, settings.capture?.maxHistoryLimit]);

  // Global click-away handler to close all filter dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowMethodDropdown(false);
        setShowSchemeDropdown(false);
        setShowStatusDropdown(false);
        setShowDomainDropdown(false);
        setShowProjectDropdown(false);
        setShowSearchConfig(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check and execute any pending context menu tools actions (from right click context menu)
  useEffect(() => {
    const checkPendingAction = () => {
      chrome.storage.local.get('pending_tool_action', (res) => {
        if (res.pending_tool_action) {
          const actionPayload = res.pending_tool_action as { type: string; text: string };
          const { type, text } = actionPayload;
          chrome.storage.local.remove('pending_tool_action');
          if (type === 'decode-base64' || type === 'TRIGGER_BASE64_DECODE') {
            handleSendToBase64(text, 'decode');
          } else if (type === 'encode-base64' || type === 'TRIGGER_BASE64_ENCODE') {
            handleSendToBase64(text, 'encode');
          } else if (type === 'decode-jwt' || type === 'TRIGGER_JWT_DECODE') {
            handleSendToJwt(text);
          } else if (type === 'ask-ai' || type === 'TRIGGER_ASK_AI') {
            handleAskAI(`Analyze and explain this string selected from the web page:\n\n"${text}"`);
          }
        }
      });
    };

    // Initial check on sidepanel startup
    checkPendingAction();

    // Live update when sidepanel is currently open
    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.pending_tool_action?.newValue) {
        checkPendingAction();
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, [handleSendToBase64, handleSendToJwt]);

  const handleSendToRepeater = useCallback((req: CapturedRequest) => {
    setRepeaterRequest({
      method: req.method,
      url: req.url,
      headers: JSON.stringify(req.requestHeaders, null, 2),
      body: req.requestBody || '',
    });
    setActiveNetworkTab('requester');
  }, []);

  // Listen for send-to-repeater events dispatched from InlineRequestExecutor in ChatPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ method: string; url: string; headers: Record<string, string>; body: string }>).detail;
      setRepeaterRequest({
        method: detail.method,
        url: detail.url,
        headers: JSON.stringify(detail.headers, null, 2),
        body: detail.body || '',
      });
      setActiveNetworkTab('requester');
      setActiveMainTab('network');
    };
    window.addEventListener('send-to-repeater', handler);
    return () => window.removeEventListener('send-to-repeater', handler);
  }, []);


  const handleUpdateRequest = useCallback((updatedReq: CapturedRequest) => {
    setRequests(prev => prev.map(r => r.id === updatedReq.id ? updatedReq : r));
    setSelectedRequest(prev => prev && prev.id === updatedReq.id ? updatedReq : prev);
  }, []);

  const handleSelectRequest = useCallback((req: CapturedRequest) => {
    if (selectMode) {
      setSelectedIds(prev => {
        if (prev.includes(req.id)) {
          return prev.filter(id => id !== req.id);
        }
        return [...prev, req.id];
      });
    } else if (compareMode) {
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
  }, [selectMode, compareMode]);

  const handleClearRequests = useCallback(() => {
    if (confirm('Clear all captured requests permanently?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' });
      setRequests([]);
      setSelectedRequest(null);
    }
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
      excludeScope: '',
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

  const availableDomains = useMemo(() => {
    const domains = new Set<string>();
    requests.forEach(r => {
      if (!r?.url) return;
      try {
        const urlObj = new URL(r.url);
        if (urlObj.hostname) {
          domains.add(urlObj.hostname);
        }
      } catch (_) {}
    });
    return Array.from(domains).sort();
  }, [requests]);

  const filteredRequests = requests.filter(r => {
    if (!r) return false;
    
    // 1. Text Search (Configurable via searchConfig)
    if (filter) {
      try {
        const f = filter.toLowerCase();
        let matched = false;

        if (searchConfig.urlAndMethod) {
          const urlStr = r.url ? String(r.url).toLowerCase() : '';
          const methodStr = r.method ? String(r.method).toLowerCase() : '';
          if (urlStr.includes(f) || methodStr.includes(f)) matched = true;
        }

        if (!matched && searchConfig.headers) {
          if (r.requestHeaders && typeof r.requestHeaders === 'object') {
            if (Object.entries(r.requestHeaders).some(([k,v]) => 
              String(k).toLowerCase().includes(f) || String(v).toLowerCase().includes(f)
            )) matched = true;
          }
          if (!matched && r.responseHeaders && typeof r.responseHeaders === 'object') {
            if (Object.entries(r.responseHeaders).some(([k,v]) => 
              String(k).toLowerCase().includes(f) || String(v).toLowerCase().includes(f)
            )) matched = true;
          }
        }

        if (!matched && searchConfig.requestBody && r.requestBody) {
          if (String(r.requestBody).toLowerCase().includes(f)) matched = true;
        }

        if (!matched && searchConfig.responseBody && r.responseBody) {
          if (String(r.responseBody).toLowerCase().includes(f)) matched = true;
        }

        if (!matched) return false;
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

    // 5. Domain (Multi-select)
    if (filterDomains.length > 0) {
      try {
        const urlStr = r.url ? String(r.url) : '';
        const urlObj = new URL(urlStr);
        if (!filterDomains.includes(urlObj.hostname)) return false;
      } catch {
        const urlStr = r.url ? String(r.url).toLowerCase() : '';
        const matchesAny = filterDomains.some(d => urlStr.includes(d.toLowerCase()));
        if (!matchesAny) return false;
      }
    }

    // 6. Tagged & Notes Filter for the Tagged Sub-Tab
    if (activeNetworkTab === 'tagged') {
      const hasTag = r.tag && r.tag !== 'none';
      const hasNotes = r.notes && r.notes.trim() !== '';
      if (!hasTag && !hasNotes) return false;
    }

    return true;
  }).slice().reverse();

  const handleDeleteFilteredRequests = useCallback(() => {
    if (filteredRequests.length === 0) return;
    const msg = `Delete all ${filteredRequests.length} filtered requests permanently?`;
    if (confirm(msg)) {
      const ids = filteredRequests.map(r => r.id);
      chrome.runtime.sendMessage({ type: 'DELETE_FILTERED_REQUESTS', payload: { ids } });
      setRequests(prev => prev.filter(r => !ids.includes(r.id)));
      setSelectedRequest(prev => prev && ids.includes(prev.id) ? null : prev);
    }
  }, [filteredRequests]);

  const handleDeleteSelectedRequests = useCallback(() => {
    if (selectedIds.length === 0) return;
    const msg = `Delete all ${selectedIds.length} selected requests permanently?`;
    if (confirm(msg)) {
      chrome.runtime.sendMessage({ type: 'DELETE_FILTERED_REQUESTS', payload: { ids: selectedIds } });
      setRequests(prev => prev.filter(r => !selectedIds.includes(r.id)));
      setSelectedRequest(prev => prev && selectedIds.includes(prev.id) ? null : prev);
      setSelectedIds([]);
    }
  }, [selectedIds]);

  // Keyboard arrow keys navigation for request list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only navigate when active main tab is network and we're looking at history/tagged
      if (activeMainTab !== 'network' || (activeNetworkTab !== 'history' && activeNetworkTab !== 'tagged')) {
        return;
      }

      // Check if user is typing in any inputs/textarea
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (filteredRequests.length === 0) return;
        
        e.preventDefault(); // Prevent standard page scrolling

        let newSelected: CapturedRequest | null = null;
        const currentIndex = selectedRequest 
          ? filteredRequests.findIndex(r => r.id === selectedRequest.id) 
          : -1;

        if (e.key === 'ArrowDown') {
          if (currentIndex === -1) {
            newSelected = filteredRequests[0];
          } else if (currentIndex < filteredRequests.length - 1) {
            newSelected = filteredRequests[currentIndex + 1];
          }
        } else if (e.key === 'ArrowUp') {
          if (currentIndex === -1) {
            newSelected = filteredRequests[filteredRequests.length - 1];
          } else if (currentIndex > 0) {
            newSelected = filteredRequests[currentIndex - 1];
          }
        }

        if (newSelected) {
          handleSelectRequest(newSelected);
          
          // Smooth scroll to the newly selected element in the request list
          setTimeout(() => {
            const selectedElement = document.querySelector('.request-item.selected');
            if (selectedElement) {
              selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
          }, 0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMainTab, activeNetworkTab, filteredRequests, selectedRequest, handleSelectRequest]);

  // Handle detail pane resizing
  useEffect(() => {
    if (!isDraggingDetail) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      // We calculate new height based on window height minus mouse Y
      // We also subtract a little bit to account for bottom bars if any, but window.innerHeight - e.clientY works well for fixed layouts.
      let newHeight = window.innerHeight - e.clientY;
      if (newHeight < 100) newHeight = 100; // Min height
      if (newHeight > window.innerHeight - 150) newHeight = window.innerHeight - 150; // Max height
      setDetailPaneHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsDraggingDetail(false);
      document.body.style.cursor = 'default';
    };
    
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isDraggingDetail]);

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
                fontSize: 13,
                padding: '5px 12px',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: 650,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{(settings.projects || []).find(p => p.id === (settings.currentProjectId || 'default'))?.name || 'Default Project'}</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
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
                minWidth: 160,
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
                      padding: '10px 14px',
                      fontSize: 13,
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
        <div className="header-logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img 
            src="/public/icons/icon-32.png" 
            alt="BrowseLens Logo" 
            style={{ 
              width: 20, 
              height: 20, 
              objectFit: 'contain', 
              borderRadius: 4,
              boxShadow: '0 0 8px rgba(0, 229, 255, 0.4)'
            }}
            onError={(e) => {
              e.currentTarget.src = 'icons/icon-32.png';
            }}
          />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fff', letterSpacing: '0.5px' }}>BrowseLens</span>
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
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="tab-nav">
        <button
          className={`tab-btn ${activeMainTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('network')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <img 
            src={chrome.runtime.getURL('icons/ui/network.svg')} 
            alt="Network" 
            style={{ 
              width: 14, 
              height: 14, 
              filter: activeMainTab === 'network' ? 'drop-shadow(0 0 4px rgba(0, 229, 255, 0.8))' : 'opacity(0.7)',
              transition: 'all 0.2s ease' 
            }} 
          />
          Network
          {requests.length > 0 && <span className="tab-badge">{requests.length}</span>}
        </button>
        <button
          className={`tab-btn ${activeMainTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('chat')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <img 
            src={chrome.runtime.getURL('icons/ui/chat.svg')} 
            alt="AI Chat" 
            style={{ 
              width: 14, 
              height: 14, 
              filter: activeMainTab === 'chat' ? 'drop-shadow(0 0 4px rgba(0, 229, 255, 0.8))' : 'opacity(0.7)',
              transition: 'all 0.2s ease' 
            }} 
          />
          AI Chat
        </button>
        <button
          className={`tab-btn ${activeMainTab === 'tools' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('tools')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <img 
            src={chrome.runtime.getURL('icons/ui/tools.svg')} 
            alt="Tools" 
            style={{ 
              width: 14, 
              height: 14, 
              filter: activeMainTab === 'tools' ? 'drop-shadow(0 0 4px rgba(0, 229, 255, 0.8))' : 'opacity(0.7)',
              transition: 'all 0.2s ease' 
            }} 
          />
          Tools
        </button>
        <button
          className={`tab-btn ${activeMainTab === 'memory' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('memory')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          🧠 Memory
        </button>
        <button
          className={`tab-btn ${activeMainTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('settings')}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg 
            width="14" 
            height="14" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              filter: activeMainTab === 'settings' ? 'drop-shadow(0 0 4px rgba(0, 229, 255, 0.8))' : 'opacity(0.7)',
              transition: 'all 0.2s ease'
            }}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12,1V4M12,20v3M4.22,4.22l2.12,2.12M17.66,17.66l2.12,2.12M1,12H4M20,12h3M4.22,19.78l2.12-2.12M17.66,6.34l2.12-2.12" />
          </svg>
          Settings
        </button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div style={{ display: activeMainTab === 'settings' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <Settings settings={settings} onSave={setSettings} />
        </div>
        
        <div style={{ display: activeMainTab === 'memory' ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
          <MemoryManagerPanel />
        </div>
        
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
              className={`sub-tab-btn ${activeNetworkTab === 'tagged' ? 'active' : ''}`}
              onClick={() => setActiveNetworkTab('tagged')}
            >
              🎯 Tagged & Notes ({requests.filter(r => (r.tag && r.tag !== 'none') || (r.notes && r.notes.trim() !== '')).length})
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
            <div style={{ display: (activeNetworkTab === 'history' || activeNetworkTab === 'tagged') ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
              
              {/* SEARCH BAR */}
              <div className="filter-bar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                  <input
                    className="filter-input"
                    placeholder="Search URL or headers..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    style={{ paddingRight: filter ? 24 : 0 }}
                  />
                  {filter && (
                    <button
                      onClick={() => setFilter('')}
                      style={{
                        position: 'absolute',
                        right: 28,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                        transition: 'color 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-red)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                      title="Clear search"
                    >
                      ✕
                    </button>
                  )}
                  <div className="dropdown-container" style={{ position: 'absolute', right: 4, display: 'flex', alignItems: 'center' }}>
                    <button
                      onClick={() => setShowSearchConfig(!showSearchConfig)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: (searchConfig.requestBody || searchConfig.responseBody) ? 'var(--accent-cyan)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                        transition: 'color 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = (searchConfig.requestBody || searchConfig.responseBody) ? 'var(--accent-cyan)' : 'var(--text-muted)')}
                      title="Search Config"
                    >
                      ⚙️
                    </button>
                    {showSearchConfig && (
                      <div className="dropdown-menu" style={{ 
                        position: 'absolute', 
                        top: '100%', 
                        right: 0, 
                        marginTop: 4, 
                        width: 180, 
                        zIndex: 100, 
                        background: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 6,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                        padding: '8px'
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-color)' }}>
                          Search Target
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={searchConfig.urlAndMethod} onChange={(e) => setSearchConfig(prev => ({ ...prev, urlAndMethod: e.target.checked }))} />
                          URL & Method
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={searchConfig.headers} onChange={(e) => setSearchConfig(prev => ({ ...prev, headers: e.target.checked }))} />
                          Headers
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={searchConfig.requestBody} onChange={(e) => setSearchConfig(prev => ({ ...prev, requestBody: e.target.checked }))} />
                          Request Body
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-primary)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={searchConfig.responseBody} onChange={(e) => setSearchConfig(prev => ({ ...prev, responseBody: e.target.checked }))} />
                          Response Body
                        </label>
                      </div>
                    )}
                  </div>
                </div>
                {requests.length > 0 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', marginRight: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{filteredRequests.length}/{requests.length}</span>
                    {filteredRequests.length < requests.length && (
                      <button
                        onClick={handleDeleteFilteredRequests}
                        title={`Purge all ${filteredRequests.length} filtered requests matching current criteria`}
                        style={{
                          background: 'rgba(255, 51, 102, 0.15)',
                          border: '1px solid var(--accent-red)',
                          color: 'var(--accent-red)',
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          transition: 'all 0.15s ease',
                          whiteSpace: 'nowrap',
                          height: 22
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--accent-red)';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 51, 102, 0.15)';
                          e.currentTarget.style.color = 'var(--accent-red)';
                        }}
                      >
                        <img 
                          src={chrome.runtime.getURL('icons/ui/delete.svg')} 
                          alt="Purge" 
                          style={{ width: 13, height: 13, display: 'block' }} 
                        />
                        Purge Filtered
                      </button>
                    )}
                  </span>
                )}
                <button
                  className={`filter-chip ${selectMode ? 'active' : ''}`}
                  onClick={() => {
                    setSelectMode(!selectMode);
                    setSelectedIds([]);
                    setCompareMode(false);
                    setSelectedRequest(null);
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    borderRadius: 4,
                    border: '1px solid var(--border-color)',
                    background: selectMode ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    color: selectMode ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    borderColor: selectMode ? 'var(--accent-cyan)' : 'var(--border-color)',
                    whiteSpace: 'nowrap',
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxSizing: 'border-box'
                  }}
                >
                  <img 
                    src={chrome.runtime.getURL('icons/ui/select.svg')} 
                    alt="Select" 
                    style={{ 
                      width: 14, 
                      height: 14, 
                      filter: selectMode ? 'drop-shadow(0 0 3px rgba(0, 229, 255, 0.6))' : 'opacity(0.85)',
                      transition: 'all 0.15s ease'
                    }} 
                  />
                  Select {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                </button>
                <button
                  className={`filter-chip ${compareMode ? 'active' : ''}`}
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedForCompare([]);
                    setSelectedRequest(null);
                    setSelectMode(false);
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    borderRadius: 4,
                    border: '1px solid var(--border-color)',
                    background: compareMode ? 'rgba(0, 229, 255, 0.1)' : 'transparent',
                    color: compareMode ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: 700,
                    borderColor: compareMode ? 'var(--accent-cyan)' : 'var(--border-color)',
                    whiteSpace: 'nowrap',
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxSizing: 'border-box'
                  }}
                >
                  <img 
                    src={chrome.runtime.getURL('icons/ui/compare.svg')} 
                    alt="Compare" 
                    style={{ 
                      width: 14, 
                      height: 14, 
                      filter: compareMode ? 'drop-shadow(0 0 3px rgba(0, 229, 255, 0.6))' : 'opacity(0.85)',
                      transition: 'all 0.15s ease'
                    }} 
                  />
                  Compare
                </button>
              </div>

              {/* ADVANCED FILTER BAR */}
              <div className="filter-options" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px' }}>
                
                {/* 1. Method Dropdown */}
                <div style={{ position: 'relative' }} className="dropdown-container">
                  <button
                    onClick={() => {
                      setShowMethodDropdown(!showMethodDropdown);
                      setShowSchemeDropdown(false);
                      setShowStatusDropdown(false);
                      setShowDomainDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      height: 30,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Method: {filterMethod === 'ALL' ? 'All' : filterMethod}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
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
                      minWidth: 130,
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
                            padding: '8px 12px',
                            fontSize: 12.5,
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
                <div style={{ position: 'relative' }} className="dropdown-container">
                  <button
                    onClick={() => {
                      setShowSchemeDropdown(!showSchemeDropdown);
                      setShowMethodDropdown(false);
                      setShowStatusDropdown(false);
                      setShowDomainDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      height: 30,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Scheme: {filterScheme === 'ALL' ? 'All' : filterScheme}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
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
                      minWidth: 120,
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
                            padding: '8px 12px',
                            fontSize: 12.5,
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
                <div style={{ position: 'relative' }} className="dropdown-container">
                  <button
                    onClick={() => {
                      setShowStatusDropdown(!showStatusDropdown);
                      setShowMethodDropdown(false);
                      setShowSchemeDropdown(false);
                      setShowDomainDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      height: 30,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Status: {filterStatus === 'ALL' ? 'All' : filterStatus}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
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
                      minWidth: 150,
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
                            padding: '8px 12px',
                            fontSize: 12.5,
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

                {/* 4. Domain Dropdown (Multi-Select) */}
                <div style={{ position: 'relative' }} className="dropdown-container">
                  <button
                    onClick={() => {
                      setShowDomainDropdown(!showDomainDropdown);
                      setShowMethodDropdown(false);
                      setShowSchemeDropdown(false);
                      setShowStatusDropdown(false);
                    }}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      padding: '6px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      height: 30,
                      boxSizing: 'border-box'
                    }}
                  >
                    <span>Domains: {filterDomains.length === 0 ? 'All' : `${filterDomains.length} selected`}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
                  </button>
                  {showDomainDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      zIndex: 100000,
                      minWidth: 220,
                      maxWidth: 320,
                      maxHeight: 250,
                      overflowY: 'auto',
                      padding: '8px 0'
                    }}>
                      {availableDomains.length === 0 ? (
                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>No domains captured</div>
                      ) : (
                        <>
                          {filterDomains.length > 0 && (
                            <div
                              onClick={() => setFilterDomains([])}
                              style={{
                                padding: '6px 12px',
                                fontSize: 11,
                                color: 'var(--accent-red)',
                                cursor: 'pointer',
                                fontWeight: 700,
                                borderBottom: '1px solid var(--border-color)',
                                marginBottom: 4,
                                textAlign: 'center'
                              }}
                            >
                              Clear Filter ({filterDomains.length})
                            </div>
                          )}
                          {availableDomains.map(d => {
                            const isChecked = filterDomains.includes(d);
                            return (
                              <label
                                key={d}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  color: isChecked ? 'var(--accent-cyan)' : 'var(--text-primary)',
                                  transition: 'all 0.12s ease',
                                  userSelect: 'none',
                                  wordBreak: 'break-all'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    setFilterDomains(prev =>
                                      prev.includes(d) ? prev.filter(item => item !== d) : [...prev, d]
                                    );
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                                <span>{d}</span>
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* LIST & DETAIL */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {selectMode && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      background: 'rgba(0, 229, 255, 0.05)',
                      borderBottom: '1px solid var(--border-color)',
                      flexWrap: 'wrap'
                    }}>
                      <span style={{ fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 700 }}>
                        Selected: {selectedIds.length}/{filteredRequests.length}
                      </span>
                      
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => {
                            if (selectedIds.length === filteredRequests.length) {
                              setSelectedIds([]);
                            } else {
                              setSelectedIds(filteredRequests.map(r => r.id));
                            }
                          }}
                          style={{
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            borderRadius: 4,
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {selectedIds.length === filteredRequests.length ? '⬜ Deselect All' : '☑ Select All'}
                        </button>
                        
                        <button
                          onClick={handleDeleteSelectedRequests}
                          disabled={selectedIds.length === 0}
                          style={{
                            background: selectedIds.length === 0 ? 'rgba(255, 51, 102, 0.05)' : 'rgba(255, 51, 102, 0.15)',
                            border: '1px solid var(--accent-red)',
                            color: 'var(--accent-red)',
                            borderRadius: 4,
                            padding: '3px 8px',
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
                            opacity: selectedIds.length === 0 ? 0.5 : 1
                          }}
                        >
                          🗑️ Delete Selected ({selectedIds.length})
                        </button>
                        
                        <button
                          onClick={() => {
                            setSelectMode(false);
                            setSelectedIds([]);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: 10,
                            cursor: 'pointer',
                            padding: '3px 6px'
                          }}
                        >
                          ✕ Close
                        </button>
                      </div>
                    </div>
                  )}
                  <RequestList
                    requests={filteredRequests}
                    selected={selectedRequest}
                    selectedList={selectedForCompare}
                    onSelect={handleSelectRequest}
                    selectMode={selectMode}
                    selectedIds={selectedIds}
                  />
                </div>
                
                {((compareMode && selectedForCompare.length > 0) || (!compareMode && selectedRequest)) && (
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setIsDraggingDetail(true);
                    }}
                    style={{
                      height: 5,
                      background: isDraggingDetail ? 'var(--accent-cyan)' : 'var(--border-color)',
                      cursor: 'row-resize',
                      flexShrink: 0,
                      transition: 'background 0.2s',
                      opacity: isDraggingDetail ? 1 : 0.5
                    }}
                    onMouseEnter={(e) => {
                      if (!isDraggingDetail) e.currentTarget.style.background = 'var(--accent-cyan)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isDraggingDetail) e.currentTarget.style.background = 'var(--border-color)';
                    }}
                  />
                )}
                
                {compareMode ? (
                  selectedForCompare.length === 2 ? (
                    <div style={{ height: detailPaneHeight, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <RequestDiff
                        requestA={selectedForCompare[0]}
                        requestB={selectedForCompare[1]}
                        onClose={() => setSelectedForCompare([])}
                      />
                    </div>
                  ) : (
                    selectedForCompare.length > 0 && (
                      <div style={{
                        padding: 12,
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 10,
                        background: 'var(--bg-light)',
                        borderTop: '1px solid var(--border-color)',
                        height: detailPaneHeight,
                        flexShrink: 0
                      }}>
                        ⚔️ Compare Mode Active. Select <b>{2 - selectedForCompare.length}</b> more request{2 - selectedForCompare.length > 1 ? 's' : ''} from history to compare.
                      </div>
                    )
                  )
                ) : (
                  selectedRequest && (
                    <div style={{ height: detailPaneHeight, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <RequestDetail
                        request={selectedRequest}
                        allRequests={requests}
                        onSendToRepeater={handleSendToRepeater}
                        onAskAI={handleAskAI}
                        onClose={() => setSelectedRequest(null)}
                        onSendToBase64={handleSendToBase64}
                        onSendToJwt={handleSendToJwt}
                        onUpdateRequest={handleUpdateRequest}
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
          <ToolsPanel initialTab={toolsInitialTab} initialBase64={toolsInitialBase64Text} initialJwt={toolsInitialJwtText} requests={requests} />
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
