import { useState, useEffect } from 'react';

interface Props {
  body: string;
  onChange: (newBody: string) => void;
}

export default function GraphQLVarsEditor({ body, onChange }: Props) {
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = JSON.parse(body);
      setParsed(p);
      setError(null);
    } catch (e) {
      setError('Invalid JSON in request body. Fix it in the Raw tab first.');
    }
  }, [body]);

  if (error) {
    return <div style={{ color: 'var(--accent-red)', padding: 12, fontSize: 12 }}>{error}</div>;
  }

  if (!parsed) return null;

  const handleUpdateVariable = (opIndex: number | null, key: string, valueStr: string) => {
    try {
      let value = valueStr;
      try {
        value = JSON.parse(valueStr);
      } catch {
        // if not valid JSON, treat as string or empty
        if (valueStr === '') value = '' as any;
      }

      const newParsed = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      if (Array.isArray(newParsed) && opIndex !== null) {
        newParsed[opIndex] = { ...newParsed[opIndex] };
        newParsed[opIndex].variables = { ...(newParsed[opIndex].variables || {}), [key]: value };
      } else if (!Array.isArray(newParsed)) {
        newParsed.variables = { ...(newParsed.variables || {}), [key]: value };
      }
      onChange(JSON.stringify(newParsed, null, 2));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveVariable = (opIndex: number | null, key: string) => {
    try {
      const newParsed = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      if (Array.isArray(newParsed) && opIndex !== null) {
        newParsed[opIndex] = { ...newParsed[opIndex] };
        const vars = { ...(newParsed[opIndex].variables || {}) };
        delete vars[key];
        newParsed[opIndex].variables = vars;
      } else if (!Array.isArray(newParsed)) {
        const vars = { ...(newParsed.variables || {}) };
        delete vars[key];
        newParsed.variables = vars;
      }
      onChange(JSON.stringify(newParsed, null, 2));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddVariable = (opIndex: number | null) => {
    const key = prompt('Variable Name:');
    if (!key) return;
    try {
      const newParsed = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      if (Array.isArray(newParsed) && opIndex !== null) {
        newParsed[opIndex] = { ...newParsed[opIndex] };
        newParsed[opIndex].variables = { ...(newParsed[opIndex].variables || {}), [key]: "" };
      } else if (!Array.isArray(newParsed)) {
        newParsed.variables = { ...(newParsed.variables || {}), [key]: "" };
      }
      onChange(JSON.stringify(newParsed, null, 2));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAutoExtract = (opIndex: number | null, query: string) => {
    try {
      const defMatch = query.match(/(?:query|mutation|subscription)\s*[^{]*\(([^)]+)\)/);
      if (!defMatch) {
        alert('No variables declared in the query header (e.g. query Name($var: Type)).');
        return;
      }
      const params = defMatch[1];
      const regex = /\$([\w]+)/g;
      let match;
      const foundVars: string[] = [];
      while ((match = regex.exec(params)) !== null) {
        foundVars.push(match[1]);
      }
      if (foundVars.length === 0) {
        alert('No variables found in the query header.');
        return;
      }
      const newParsed = Array.isArray(parsed) ? [...parsed] : { ...parsed };
      let targetObj;
      if (Array.isArray(newParsed) && opIndex !== null) {
        newParsed[opIndex] = { ...newParsed[opIndex] };
        targetObj = newParsed[opIndex];
      } else {
        targetObj = newParsed;
      }
      
      const currentVars = { ...(targetObj.variables || {}) };
      let addedCount = 0;
      foundVars.forEach(v => {
        if (!(v in currentVars)) {
          currentVars[v] = "";
          addedCount++;
        }
      });
      targetObj.variables = currentVars;
      
      if (addedCount > 0) {
        onChange(JSON.stringify(newParsed, null, 2));
      } else {
        alert('All variables from the query are already present.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderOpVars = (op: any, index: number | null) => {
    const vars = op.variables || {};
    const opName = op.operationName || (index !== null ? `Operation ${index + 1}` : 'Query');
    
    return (
      <div key={index ?? 'single'} style={{ marginBottom: 16, background: 'var(--bg-darker)', borderRadius: 6, border: '1px solid var(--border-primary)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-primary)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)' }}>{opName} Variables</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {op.query && typeof op.query === 'string' && (
              <button
                onClick={() => handleAutoExtract(index, op.query)}
                style={{ background: 'none', border: '1px solid var(--accent-yellow)', color: 'var(--accent-yellow)', fontSize: 11, cursor: 'pointer', borderRadius: 4, padding: '2px 8px' }}
                title="Extract variables declared in the query string"
              >
                ⚡ Auto-Extract
              </button>
            )}
            <button
              onClick={() => handleAddVariable(index)}
              style={{ background: 'none', border: '1px solid var(--border-primary)', color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer', borderRadius: 4, padding: '2px 8px' }}
            >
              + Add
            </button>
          </div>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.keys(vars).length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No variables</div>
          ) : (
            Object.entries(vars).map(([key, val]) => {
              const valStr = typeof val === 'string' ? val : JSON.stringify(val);
              return (
                <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    readOnly
                    value={key}
                    style={{
                      width: '120px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--accent-yellow)',
                      padding: '6px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                  <textarea
                    value={valStr}
                    onChange={(e) => handleUpdateVariable(index, key, e.target.value)}
                    style={{
                      flex: 1,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      color: 'var(--text-primary)',
                      padding: '6px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      minHeight: '30px',
                      resize: 'vertical'
                    }}
                  />
                  <button
                    onClick={() => handleRemoveVariable(index, key)}
                    style={{
                      background: 'rgba(255, 51, 102, 0.1)',
                      border: '1px solid rgba(255, 51, 102, 0.2)',
                      color: 'var(--accent-red)',
                      width: '30px',
                      height: '30px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Remove Variable"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
      {Array.isArray(parsed) ? (
        parsed.map((op, i) => renderOpVars(op, i))
      ) : (
        renderOpVars(parsed, null)
      )}
    </div>
  );
}
