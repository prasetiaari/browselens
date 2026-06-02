import { useState, useEffect } from 'react';
import type { ExtensionSettings } from '../../shared/types';
import ProjectPanel from './ProjectPanel';

interface Props {
  settings: ExtensionSettings;
  onSave: (settings: ExtensionSettings) => void;
}

export default function Settings({ settings, onSave }: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'project' | 'global'>('project');
  const [local, setLocal] = useState<ExtensionSettings>({
    ...settings,
    projects: settings.projects || [],
  });
  const [saved, setSaved] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const fetchDebugLogs = () => {
    chrome.storage.local.get('debug_log', (res) => {
      setDebugLogs((res.debug_log || []) as string[]);
    });
  };

  const clearDebugLogs = () => {
    chrome.storage.local.set({ debug_log: [] }, () => {
      setDebugLogs([]);
    });
  };

  useEffect(() => {
    if (showDebug) {
      fetchDebugLogs();
      const interval = setInterval(fetchDebugLogs, 2000);
      return () => clearInterval(interval);
    }
  }, [showDebug]);

  // Synchronize local state with prop settings changes (e.g. from switching project)
  useEffect(() => {
    setLocal({
      ...settings,
      projects: settings.projects || [],
    });
  }, [settings]);

  const handleSave = () => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_SETTINGS', payload: local },
      (response) => {
        if (response?.success) {
          onSave(local);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
          
          // If capture was just enabled, explicitly attach to the current window's active tab
          if (local.capture.enabled) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0] && tabs[0].id) {
                chrome.runtime.sendMessage({ type: 'ATTACH_TO_TAB', payload: { tabId: tabs[0].id } });
              }
            });
          }
        }
      }
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
      {/* Sub-tab Navigation */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        padding: '2px 8px 0 8px'
      }}>
        <button
          onClick={() => setActiveSubTab('project')}
          style={{
            flex: 1,
            padding: '10px',
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'project' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeSubTab === 'project' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          📁 Project Context
        </button>
        <button
          onClick={() => setActiveSubTab('global')}
          style={{
            flex: 1,
            padding: '10px',
            background: 'none',
            border: 'none',
            borderBottom: activeSubTab === 'global' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
            color: activeSubTab === 'global' ? 'var(--accent-cyan)' : 'var(--text-muted)',
            fontWeight: 700,
            fontSize: 12.5,
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          ⚙️ Global System
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeSubTab === 'project' ? (
          <ProjectPanel settings={settings} onSave={onSave} />
        ) : (
          <div className="settings" style={{ padding: '16px 20px', boxSizing: 'border-box' }}>
            <h2>⚙️ Global System Settings</h2>

            {/* GLOBAL SETTINGS SECTION */}
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <h3>🤖 Global AI Provider</h3>

              <div className="settings-field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Provider</label>
                <select
                  value={local.ai.provider}
                  onChange={e => setLocal({
                    ...local,
                    ai: {
                      ...local.ai,
                      provider: e.target.value as ExtensionSettings['ai']['provider'],
                      baseUrl: e.target.value === 'lmstudio' ? 'http://localhost:1234/v1'
                        : e.target.value === 'ollama' ? 'http://localhost:11434/v1'
                        : 'https://api.openai.com/v1',
                    },
                  })}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none' }}
                >
                  <option value="lmstudio">LM Studio (Local)</option>
                  <option value="ollama">Ollama (Local)</option>
                  <option value="openai">OpenAI (Cloud)</option>
                </select>
              </div>

              <div className="settings-field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>API Base URL</label>
                <input
                  type="text"
                  value={local.ai.baseUrl}
                  onChange={e => setLocal({ ...local, ai: { ...local.ai, baseUrl: e.target.value } })}
                  placeholder="http://localhost:1234/v1"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div className="settings-field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Model Name</label>
                <input
                  type="text"
                  value={local.ai.model}
                  onChange={e => setLocal({ ...local, ai: { ...local.ai, model: e.target.value } })}
                  placeholder="qwen2.5-coder-7b-instruct"
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div className="settings-field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Max Payload Truncation (chars)</label>
                <input
                  type="number"
                  value={local.ai.maxPayloadSize || 1500}
                  onChange={e => setLocal({ ...local, ai: { ...local.ai, maxPayloadSize: parseInt(e.target.value) || 1500 } })}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  Increase if your AI has a large context window (e.g. 10000). Keep small (1500) for 4B/7B models to prevent hallucination loops.
                </div>
              </div>

              {local.ai.provider === 'openai' && (
                <div className="settings-field" style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>API Key</label>
                  <input
                    type="password"
                    value={local.ai.apiKey || ''}
                    onChange={e => setLocal({ ...local, ai: { ...local.ai, apiKey: e.target.value } })}
                    placeholder="sk-..."
                    style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div className="settings-field" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="allowAutoRequest"
                  checked={local.ai.allowAutoRequest || false}
                  onChange={e => setLocal({ ...local, ai: { ...local.ai, allowAutoRequest: e.target.checked } })}
                />
                <label htmlFor="allowAutoRequest" style={{ fontSize: 12, color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Allow AI to autonomously send HTTP requests (DANGEROUS)
                </label>
              </div>

              <div className="settings-field" style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>AI System Prompt</label>
                <textarea
                  value={local.ai.systemPrompt || ''}
                  onChange={e => setLocal({ ...local, ai: { ...local.ai, systemPrompt: e.target.value } })}
                  placeholder="You are BrowseLens AI..."
                  rows={14}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    lineHeight: '1.5',
                    resize: 'vertical',
                    minHeight: 250
                  }}
                />
              </div>
            </div>

            {/* STORAGE SETTINGS */}
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <h3>💾 Storage & Capturing Limits</h3>

              <div className="settings-field" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={local.capture.enabled}
                  onChange={e => setLocal({
                    ...local,
                    capture: { ...local.capture, enabled: e.target.checked },
                  })}
                  style={{ cursor: 'pointer' }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Enable dynamic capturing engine</label>
              </div>

              <div className="settings-field">
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Max History Limit (Requests to keep)</label>
                <input
                  type="number"
                  min={100}
                  max={10000}
                  value={local.capture.maxHistoryLimit || 1000}
                  onChange={e => setLocal({
                    ...local,
                    capture: { ...local.capture, maxHistoryLimit: parseInt(e.target.value, 10) || 1000 },
                  })}
                  style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, margin: 0 }}>
                  Setting this too high (e.g. &gt; 5000) may impact Sidepanel rendering.
                </p>
              </div>
            </div>

            <button
              className="settings-save-btn"
              onClick={handleSave}
              style={{
                width: '100%',
                padding: '10px',
                background: 'var(--accent-cyan)',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Save Settings
            </button>
            {saved && <div className="settings-status" style={{ textAlign: 'center', color: 'var(--accent-green)', fontWeight: 700, fontSize: 12, marginTop: 8 }}>✓ Global Settings saved!</div>}

            <div className="settings-section" style={{ marginTop: 24, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
              <div 
                onClick={() => setShowDebug(!showDebug)} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  🩺 Background Debug Console {showDebug ? '👇' : '👉'}
                </h3>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {showDebug ? 'Hide Console' : 'Show Console'}
                </span>
              </div>

              {showDebug && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button 
                      onClick={fetchDebugLogs} 
                      style={{ 
                        padding: '4px 8px', 
                        fontSize: 10, 
                        backgroundColor: 'var(--bg-secondary)', 
                        border: '1px solid var(--border-color)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: 'var(--text-primary)'
                      }}
                    >
                      🔄 Refresh
                    </button>
                    <button 
                      onClick={clearDebugLogs} 
                      style={{ 
                        padding: '4px 8px', 
                        fontSize: 10, 
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: 4,
                        cursor: 'pointer',
                        color: 'rgb(239, 68, 68)'
                      }}
                    >
                      🗑️ Clear Logs
                    </button>
                  </div>
                  
                  <div 
                    style={{ 
                      backgroundColor: 'rgba(0, 0, 0, 0.3)', 
                      border: '1px solid var(--border-color)',
                      borderRadius: 6,
                      padding: 10,
                      maxHeight: 200,
                      overflowY: 'auto',
                      fontFamily: 'monospace',
                      fontSize: 9,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {debugLogs.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                        No diagnostic events recorded yet. Try capturing some traffic.
                      </div>
                    ) : (
                      debugLogs.slice().reverse().map((log, i) => {
                        let color = 'var(--text-secondary)';
                        if (log.includes('FAILED') || log.includes('rejected')) {
                          color = '#ef4444'; // red
                        } else if (log.includes('saveSingleRequest') || log.includes('loadRequests')) {
                          color = '#10b981'; // green
                        } else if (log.includes('REQUEST_CAPTURED')) {
                          color = '#06b6d4'; // cyan
                        }
                        return (
                          <div key={i} style={{ color, marginBottom: 4, borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: 2 }}>
                            {log}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
