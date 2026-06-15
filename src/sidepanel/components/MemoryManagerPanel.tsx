import { useState, useEffect } from 'react';
import type { KnowledgePayload } from '../../shared/ai/memory';

interface MemoryItem extends KnowledgePayload {
  id: string;
}

export default function MemoryManagerPanel() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editType, setEditType] = useState<KnowledgePayload['knowledge_type']>('heuristic');

  // FAQ State
  const [showFaq, setShowFaq] = useState(false);

  const fetchMemories = () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage({ type: 'GET_ALL_MEMORY' }, (response) => {
      setLoading(false);
      if (response?.success) {
        setMemories(response.data || []);
      } else {
        setError(response?.error || 'Failed to fetch memories');
      }
    });
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    
    chrome.runtime.sendMessage({ type: 'DELETE_MEMORY', payload: { id } }, (response) => {
      if (response?.success) {
        fetchMemories();
      } else {
        alert('Failed to delete: ' + response?.error);
      }
    });
  };

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditContent(item.content);
    setEditDomain(item.target_domain || '');
    setEditType(item.knowledge_type);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditDomain('');
  };

  const saveEdit = (id: string) => {
    const payload: KnowledgePayload = {
      knowledge_type: editType,
      target_domain: editDomain.trim() || undefined,
      content: editContent,
      timestamp: Date.now()
    };

    chrome.runtime.sendMessage({ type: 'UPDATE_MEMORY', payload: { id, payload } }, (response) => {
      if (response?.success) {
        setEditingId(null);
        fetchMemories();
      } else {
        alert('Failed to update: ' + response?.error);
      }
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'heuristic': return 'var(--accent-cyan)';
      case 'finding': return 'var(--accent-red)';
      case 'observation': return 'var(--accent-yellow)';
      case 'lesson_learned': return 'var(--accent-green)';
      default: return 'var(--text-primary)';
    }
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          🧠 RAG Knowledge Base
          <button 
            onClick={() => setShowFaq(!showFaq)}
            style={{ 
              background: 'rgba(0, 229, 255, 0.1)', 
              border: '1px solid rgba(0, 229, 255, 0.3)', 
              color: 'var(--accent-cyan)', 
              borderRadius: '50%', 
              width: 20, 
              height: 20, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              fontSize: 12, 
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            title="Help & FAQ"
          >
            ?
          </button>
        </h2>
        <button 
          onClick={fetchMemories} 
          disabled={loading}
          style={{ padding: '6px 12px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          {loading ? '↻ Loading...' : '↻ Refresh'}
        </button>
      </div>

      {showFaq && (
        <div style={{ 
          marginBottom: 16, 
          padding: 16, 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--text-secondary)'
        }}>
          <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>📖 RAG System Guide & FAQ</h3>
          <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
            <li><b>Auto-Save via AI:</b> AI will autonomously save findings when you ask for "AI Audit" or "AI Explain".</li>
            <li><b>Manual Push:</b> Click the 🧠 Push to RAG button in any Request's Notes panel to bundle the note with the raw HTTP request context.</li>
            <li><b>Manual Injection:</b> Use the Settings &gt; Global System &gt; RAG section to inject raw text.</li>
          </ul>
          <div style={{ padding: 8, background: 'rgba(0, 229, 255, 0.05)', borderLeft: '3px solid var(--accent-cyan)', marginBottom: 12 }}>
            <b style={{ color: 'var(--accent-cyan)' }}>Scope Isolation:</b> All memories are scoped to the current active <b>Project</b>. 
            <i> Heuristics</i> apply to all domains within the project, while <i>Observations</i> are strictly bound to a specific target domain.
          </div>
          <b>Q: Why isn't the AI using my memories?</b><br/>
          A: Qdrant only returns the top 3 most semantically similar memories. Ensure your notes have good context (e.g., using "Push to RAG" which includes the HTTP request).<br/><br/>
          <b>Q: Can I paste 100 lines at once?</b><br/>
          A: Not recommended. Keep memories short and focused on a single vulnerability or pattern for higher retrieval accuracy.
        </div>
      )}

      {error && <div style={{ color: 'var(--accent-red)', marginBottom: 16 }}>Error: {error}</div>}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {memories.length === 0 && !loading && !error && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
            No memories found for this project.<br/>
            Use the "Push to RAG" button or manual entry in Settings.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {memories.map(item => (
            <div key={item.id} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
              
              {editingId === item.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select 
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as any)}
                      style={{ flex: 1, padding: '4px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    >
                      <option value="heuristic">Heuristic</option>
                      <option value="observation">Observation</option>
                      <option value="finding">Finding</option>
                      <option value="lesson_learned">Lesson Learned</option>
                    </select>
                    <input 
                      type="text" 
                      placeholder="Domain (Optional)"
                      value={editDomain}
                      onChange={(e) => setEditDomain(e.target.value)}
                      style={{ flex: 1, padding: '4px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <textarea 
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '6px', background: 'var(--bg-darker)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={cancelEdit} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', cursor: 'pointer', borderRadius: 4 }}>Cancel</button>
                    <button onClick={() => saveEdit(item.id)} style={{ padding: '4px 8px', background: 'var(--accent-cyan)', border: 'none', color: '#000', cursor: 'pointer', borderRadius: 4, fontWeight: 'bold' }}>Save & Re-embed</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 'bold', padding: '2px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 4, color: getTypeColor(item.knowledge_type) }}>
                        {item.knowledge_type.toUpperCase()}
                      </span>
                      {item.target_domain && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🎯 {item.target_domain}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => startEdit(item)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7 }} title="Edit">✏️</button>
                      <button onClick={() => handleDelete(item.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7 }} title="Delete">🗑️</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {item.content}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
                    Added: {new Date(item.timestamp).toLocaleString()}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
