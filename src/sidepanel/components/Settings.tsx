import { useState, useEffect } from 'react';
import type { ExtensionSettings, CustomHeader } from '../../shared/types';

interface Props {
  settings: ExtensionSettings;
  onSave: (settings: ExtensionSettings) => void;
}

export default function Settings({ settings, onSave }: Props) {
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

  const activeProjectId = local.currentProjectId || 'default';
  const activeProject = (local.projects || []).find((p) => p.id === activeProjectId) || {
    id: 'default',
    name: 'Default Project',
    createdAt: Date.now(),
    targetScope: '',
    customHeaders: [],
  };

  const handleSave = () => {
    chrome.runtime.sendMessage(
      { type: 'SAVE_SETTINGS', payload: local },
      (response) => {
        if (response?.success) {
          onSave(local);
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        }
      }
    );
  };

  const updateActiveProjectField = (field: 'targetScope' | 'excludeScope' | 'customHeaders', value: any) => {
    setLocal({
      ...local,
      projects: (local.projects || []).map((p) => {
        if (p.id === activeProjectId) {
          return { ...p, [field]: value };
        }
        return p;
      }),
    });
  };

  const addHeaderRule = () => {
    const newRule: CustomHeader = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name: '',
      value: '',
      enabled: true,
    };
    updateActiveProjectField('customHeaders', [...(activeProject.customHeaders || []), newRule]);
  };

  const updateHeaderRule = (id: string, updates: Partial<CustomHeader>) => {
    const updated = (activeProject.customHeaders || []).map((h) =>
      h.id === id ? { ...h, ...updates } : h
    );
    updateActiveProjectField('customHeaders', updated);
  };

  const deleteHeaderRule = (id: string) => {
    const updated = (activeProject.customHeaders || []).filter((h) => h.id !== id);
    updateActiveProjectField('customHeaders', updated);
  };

  return (
    <div className="settings">
      <h2>⚙️ Settings</h2>

      {/* GLOBAL SETTINGS SECTION */}
      <div className="settings-section">
        <h3>🤖 Global AI Provider</h3>

        <div className="settings-field">
          <label>Provider</label>
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
          >
            <option value="lmstudio">LM Studio (Local)</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="openai">OpenAI (Cloud)</option>
          </select>
        </div>

        <div className="settings-field">
          <label>API Base URL</label>
          <input
            type="text"
            value={local.ai.baseUrl}
            onChange={e => setLocal({ ...local, ai: { ...local.ai, baseUrl: e.target.value } })}
            placeholder="http://localhost:1234/v1"
          />
        </div>

        <div className="settings-field">
          <label>Model Name</label>
          <input
            type="text"
            value={local.ai.model}
            onChange={e => setLocal({ ...local, ai: { ...local.ai, model: e.target.value } })}
            placeholder="qwen2.5-coder-7b-instruct"
          />
        </div>

        {local.ai.provider === 'openai' && (
          <div className="settings-field">
            <label>API Key</label>
            <input
              type="password"
              value={local.ai.apiKey || ''}
              onChange={e => setLocal({ ...local, ai: { ...local.ai, apiKey: e.target.value } })}
              placeholder="sk-..."
            />
          </div>
        )}
      </div>

      {/* PROJECT-SPECIFIC SETTINGS */}
      <div className="settings-section project-specific-section">
        <h3 className="section-title-project">
          📁 Project Settings: <span className="project-highlight">{activeProject.name}</span>
        </h3>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
          These settings only apply to the current active project.
        </p>

        <div className="settings-field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={local.capture.enabled}
              onChange={e => setLocal({
                ...local,
                capture: { ...local.capture, enabled: e.target.checked },
              })}
            />
            Enable request capture (Global)
          </label>
        </div>

        <div className="settings-field" style={{ marginTop: 12 }}>
          <label>Max History Limit (Requests to keep)</label>
          <input
            type="number"
            min={100}
            max={10000}
            value={local.capture.maxHistoryLimit || 1000}
            onChange={e => setLocal({
              ...local,
              capture: { ...local.capture, maxHistoryLimit: parseInt(e.target.value, 10) || 1000 },
            })}
          />
          <p style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
            Setting this too high (e.g. &gt; 5000) may impact React rendering performance.
          </p>
        </div>

        <div className="settings-field" style={{ marginTop: 12 }}>
          <label>Target Scope (Comma-separated domains)</label>
          <input
            type="text"
            value={activeProject.targetScope || ''}
            onChange={e => updateActiveProjectField('targetScope', e.target.value)}
            placeholder="example.com, api.test.com"
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Leave empty to capture all traffic. Scope filtering reduces noise.
          </div>
        </div>

        <div className="settings-field" style={{ marginTop: 12 }}>
          <label>Exclude Scope (Comma-separated wildcards, strings, or /regex/)</label>
          <input
            type="text"
            value={activeProject.excludeScope || ''}
            onChange={e => updateActiveProjectField('excludeScope', e.target.value)}
            placeholder="*.doubleclick.net, analytics, /activeview|worklet/i"
          />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            Supports wildcards (<code style={{color:'var(--accent-yellow)'}}>*.domain.com</code>), keyword substrings, or regular expressions starting and ending with slash (<code style={{color:'var(--accent-cyan)'}}>/pattern/i</code>).
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginBottom: 4 }}>
            🔑 Custom Header Injection
          </label>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10 }}>
            Inject dynamic/custom headers (e.g. Authorization token) globally to matching out-going requests.
          </div>

          <div className="header-rules-list">
            {(activeProject.customHeaders || []).map((rule) => (
              <div className="header-rule-row" key={rule.id}>
                <input
                  type="checkbox"
                  className="header-rule-checkbox"
                  checked={rule.enabled}
                  onChange={(e) => updateHeaderRule(rule.id, { enabled: e.target.checked })}
                />
                <input
                  type="text"
                  className="header-rule-input-name"
                  value={rule.name}
                  onChange={(e) => updateHeaderRule(rule.id, { name: e.target.value })}
                  placeholder="Header-Name"
                />
                <input
                  type="text"
                  className="header-rule-input-value"
                  value={rule.value}
                  onChange={(e) => updateHeaderRule(rule.id, { value: e.target.value })}
                  placeholder="Header Value"
                />
                <button
                  className="header-rule-delete-btn"
                  onClick={() => deleteHeaderRule(rule.id)}
                  title="Delete header rule"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <button className="add-header-btn" onClick={addHeaderRule}>
            ➕ Add Header Rule
          </button>
        </div>
      </div>

      <button className="settings-save-btn" onClick={handleSave} style={{ marginTop: 8 }}>
        Save Settings
      </button>
      {saved && <div className="settings-status">✓ Settings saved!</div>}

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
  );
}
