import { useState } from 'react';
import type { ExtensionSettings } from '../../shared/types';

interface Props {
  settings: ExtensionSettings;
  onSave: (settings: ExtensionSettings) => void;
}

export default function Settings({ settings, onSave }: Props) {
  const [local, setLocal] = useState<ExtensionSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

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

  return (
    <div className="settings">
      <h2>⚙️ Settings</h2>

      <div className="settings-section">
        <h3>🤖 AI Provider</h3>

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

      <div className="settings-section">
        <h3>📡 Request Capture</h3>

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
            Enable request capture
          </label>
        </div>
      </div>

      <button className="settings-save-btn" onClick={handleSave}>
        Save Settings
      </button>
      {saved && <div className="settings-status">✓ Settings saved!</div>}
    </div>
  );
}
