import { useState, useEffect } from 'react';
import type { ExtensionSettings, Project, CustomHeader, MatchReplaceRule } from '../../shared/types';

interface Props {
  settings: ExtensionSettings;
  onSave: (settings: ExtensionSettings) => void;
}

export default function ProjectPanel({ settings, onSave }: Props) {
  const [local, setLocal] = useState<ExtensionSettings>({ ...settings });
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const activeProjectId = local.currentProjectId || 'default';
  const activeProject = (local.projects || []).find((p) => p.id === activeProjectId) || {
    id: 'default',
    name: 'Default Project',
    createdAt: Date.now(),
    targetScope: '',
    excludeScope: '',
    customHeaders: [],
    matchReplaceRules: [],
  };

  // Draft copy of the active project configuration for non-blocking real-time form input edits
  const [projectDraft, setProjectDraft] = useState<Project>({ ...activeProject });

  // Update draft whenever switching project or receiving fresh settings from background
  useEffect(() => {
    setLocal({ ...settings });
  }, [settings]);

  useEffect(() => {
    const proj = (local.projects || []).find((p) => p.id === activeProjectId) || {
      id: 'default',
      name: 'Default Project',
      createdAt: Date.now(),
      targetScope: '',
      excludeScope: '',
      customHeaders: [],
      matchReplaceRules: [],
    };
    setProjectDraft({ ...proj });
  }, [local, activeProjectId]);

  const showNotification = (msg: string) => {
    setSavedMsg(msg);
    setTimeout(() => setSavedMsg(null), 2500);
  };

  const handleSaveSettings = () => {
    const updatedSettings = {
      ...local,
      projects: (local.projects || []).map((p) => (p.id === activeProjectId ? projectDraft : p)),
    };
    setLocal(updatedSettings);

    chrome.runtime.sendMessage(
      { type: 'SAVE_SETTINGS', payload: updatedSettings },
      (response) => {
        if (response?.success) {
          onSave(updatedSettings);
          showNotification('✓ Project Settings saved & routing rules applied!');
        }
      }
    );
  };

  const handleAddNewProject = () => {
    const name = prompt('Enter new project name:');
    if (!name || name.trim() === '') return;

    const newProj: Project = {
      id: 'proj_' + Math.random().toString(36).substring(2, 11),
      name: name.trim(),
      createdAt: Date.now(),
      targetScope: '',
      excludeScope: '',
      customHeaders: [],
      matchReplaceRules: [],
    };

    const updatedSettings = {
      ...local,
      projects: [...(local.projects || []), newProj],
      currentProjectId: newProj.id,
    };
    setLocal(updatedSettings);

    chrome.runtime.sendMessage(
      { type: 'SAVE_SETTINGS', payload: updatedSettings },
      (response) => {
        if (response?.success) {
          onSave(updatedSettings);
          showNotification(`✓ Created and switched to project "${name}"`);
        }
      }
    );
  };

  const handleSwitchProject = (id: string) => {
    const updatedSettings = {
      ...local,
      currentProjectId: id,
    };
    setLocal(updatedSettings);

    chrome.runtime.sendMessage(
      { type: 'SWITCH_PROJECT', payload: { projectId: id } },
      () => {
        chrome.runtime.sendMessage(
          { type: 'SAVE_SETTINGS', payload: updatedSettings },
          (response) => {
            if (response?.success) {
              onSave(updatedSettings);
              showNotification('✓ Switched active project context');
              // Trigger reload to force new context update
              window.location.reload();
            }
          }
        );
      }
    );
  };

  // --- Scope ---
  const handleUpdateScope = (targetScope: string, excludeScope: string) => {
    setProjectDraft((prev) => ({
      ...prev,
      targetScope,
      excludeScope,
    }));
  };

  // --- Custom Headers ---
  const handleAddHeader = () => {
    const newRule: CustomHeader = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      name: '',
      value: '',
      enabled: true,
    };
    setProjectDraft((prev) => ({
      ...prev,
      customHeaders: [...(prev.customHeaders || []), newRule],
    }));
  };

  const handleUpdateHeader = (id: string, updates: Partial<CustomHeader>) => {
    setProjectDraft((prev) => ({
      ...prev,
      customHeaders: (prev.customHeaders || []).map((h) =>
        h.id === id ? { ...h, ...updates } : h
      ),
    }));
  };

  const handleDeleteHeader = (id: string) => {
    setProjectDraft((prev) => ({
      ...prev,
      customHeaders: (prev.customHeaders || []).filter((h) => h.id !== id),
    }));
  };

  // --- Match and Replace Rules (Burp Style) ---
  const handleAddMRRule = () => {
    const newRule: MatchReplaceRule = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      type: 'requestHeader',
      match: '',
      replace: '',
      enabled: true,
    };
    setProjectDraft((prev) => ({
      ...prev,
      matchReplaceRules: [...(prev.matchReplaceRules || []), newRule],
    }));
  };

  const handleUpdateMRRule = (id: string, updates: Partial<MatchReplaceRule>) => {
    setProjectDraft((prev) => ({
      ...prev,
      matchReplaceRules: (prev.matchReplaceRules || []).map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));
  };

  const handleDeleteMRRule = (id: string) => {
    setProjectDraft((prev) => ({
      ...prev,
      matchReplaceRules: (prev.matchReplaceRules || []).filter((r) => r.id !== id),
    }));
  };

  return (
    <div className="settings" style={{ padding: '16px 20px 80px 20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>📁 Project Scope & Target</h2>
        <button
          onClick={handleAddNewProject}
          style={{
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid var(--accent-cyan)',
            color: 'var(--accent-cyan)',
            borderRadius: 4,
            padding: '5px 12px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-cyan)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)')}
        >
          + New Project
        </button>
      </div>

      {savedMsg && (
        <div style={{
          background: 'rgba(0, 230, 118, 0.1)',
          border: '1px solid var(--accent-green)',
          color: 'var(--accent-green)',
          borderRadius: 4,
          padding: '8px 12px',
          fontSize: 12.5,
          fontWeight: 600,
          marginBottom: 16,
          animation: 'fadeIn 0.2s ease',
        }}>
          {savedMsg}
        </div>
      )}

      {/* Project Selector */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, fontWeight: 600 }}>
          ACTIVE PROJECT CONTEXT:
        </label>
        <select
          value={activeProjectId}
          onChange={(e) => handleSwitchProject(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--bg-darker)',
            border: '1px solid var(--border-color)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {(local.projects || []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.id === 'default' ? '(Global context)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Target Scope */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <h3>🎯 Target Scope</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
          Specify which hostnames should be captured. Empty captures all network request traffic.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--accent-cyan)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              IN-SCOPE DOMAINS (comma separated):
            </label>
            <input
              type="text"
              placeholder="e.g. *.example.com, api.test.com"
              value={projectDraft.targetScope || ''}
              onChange={(e) => handleUpdateScope(e.target.value, projectDraft.excludeScope || '')}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-darker)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, color: 'var(--accent-red)', fontWeight: 700, display: 'block', marginBottom: 4 }}>
              EXCLUDE FROM SCOPE (comma separated or regex):
            </label>
            <input
              type="text"
              placeholder="e.g. google.com, /activeview|worklet/i"
              value={projectDraft.excludeScope || ''}
              onChange={(e) => handleUpdateScope(projectDraft.targetScope || '', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--bg-darker)',
                border: '1px solid var(--border-color)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Custom Headers */}
      <div className="settings-section" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>🔌 Custom Injection Headers</h3>
          <button
            onClick={handleAddHeader}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            + Add Header
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
          Inject custom security testing headers (e.g. JWT tokens, Authorization, cookies) into outgoing requests.
        </p>

        {(projectDraft.customHeaders || []).length === 0 ? (
          <div style={{ padding: '12px', border: '1px dashed var(--border-color)', borderRadius: 4, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No injection headers configured for this project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(projectDraft.customHeaders || []).map((h) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={(e) => handleUpdateHeader(h.id, { enabled: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <input
                  type="text"
                  placeholder="Header Name"
                  value={h.name}
                  onChange={(e) => handleUpdateHeader(h.id, { name: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={h.value}
                  onChange={(e) => handleUpdateHeader(h.id, { value: e.target.value })}
                  style={{
                    flex: 2,
                    padding: '6px 8px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleDeleteHeader(h.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-red)',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Remove Rule"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Match and Replace Engine */}
      <div className="settings-section" style={{ marginBottom: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>🔄 Match & Replace Engine (Burp Style)</h3>
          <button
            onClick={handleAddMRRule}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-cyan)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            + Add Rule
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: 1.4 }}>
          Automatically modify headers on the fly. Match header names and overwrite them dynamically.
        </p>

        {(projectDraft.matchReplaceRules || []).length === 0 ? (
          <div style={{ padding: '12px', border: '1px dashed var(--border-color)', borderRadius: 4, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No Match & Replace rules configured for this project.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(projectDraft.matchReplaceRules || []).map((mr) => (
              <div key={mr.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={mr.enabled}
                  onChange={(e) => handleUpdateMRRule(mr.id, { enabled: e.target.checked })}
                  style={{ cursor: 'pointer' }}
                />
                <select
                  value={mr.type}
                  onChange={(e) => handleUpdateMRRule(mr.id, { type: e.target.value as any })}
                  style={{
                    padding: '6px 8px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 11.5,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="requestHeader">Req Header</option>
                </select>
                <input
                  type="text"
                  placeholder="Match (Header Name)"
                  value={mr.match}
                  onChange={(e) => handleUpdateMRRule(mr.id, { match: e.target.value })}
                  style={{
                    flex: 1.2,
                    padding: '6px 8px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Replace Value"
                  value={mr.replace}
                  onChange={(e) => handleUpdateMRRule(mr.id, { replace: e.target.value })}
                  style={{
                    flex: 1.8,
                    padding: '6px 8px',
                    background: 'var(--bg-darker)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 4,
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => handleDeleteMRRule(mr.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-red)',
                    fontSize: 14,
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Remove Rule"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Save Button Container */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 20px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        justifyContent: 'flex-end',
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.2)'
      }}>
        <button
          onClick={handleSaveSettings}
          style={{
            padding: '8px 24px',
            background: 'var(--accent-cyan)',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 0 8px rgba(0, 229, 255, 0.4)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 12px rgba(0, 229, 255, 0.7)'}
          onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 0 8px rgba(0, 229, 255, 0.4)'}
        >
          Save Project Settings
        </button>
      </div>
    </div>
  );
}
