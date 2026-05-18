import { useState } from 'react';
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

  const updateActiveProjectField = (field: 'targetScope' | 'customHeaders', value: any) => {
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
    </div>
  );
}
