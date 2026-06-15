import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { parse, print, visit } from 'graphql';
import type { DocumentNode, ASTNode, FieldNode, OperationDefinitionNode, InlineFragmentNode } from 'graphql';

// --- GraphQL Editor Components ---

interface GraphQLTreeProps {
  queryStr: string;
  onChange: (newStr: string) => void;
  onPrunedChange: (newStr: string) => void;
}

const GraphQLTree: React.FC<GraphQLTreeProps> = ({ queryStr, onChange, onPrunedChange }) => {
  const [masterAst, setMasterAst] = useState<DocumentNode | null>(null);
  const [disabledPaths, setDisabledPaths] = useState<Set<string>>(new Set());
  const [lastPrinted, setLastPrinted] = useState<string>('');
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    if (queryStr !== lastPrinted) {
      try {
        const ast = parse(queryStr);
        setMasterAst(ast);
        setDisabledPaths(new Set());
      } catch (e) {
        // invalid graphql from outside
      }
    }
  }, [queryStr, lastPrinted]);

  const commitPrunedChanges = useCallback((ast: DocumentNode, disabled: Set<string>) => {
    try {
      const prunedAst = visit(ast, {
        enter(node, key, parent, path) {
          if (disabled.has(path.join('.'))) {
            return null;
          }
        }
      });
      const newQuery = print(prunedAst);
      setLastPrinted(newQuery);
      onPrunedChange(newQuery);
    } catch (e) {
      console.error('Failed to print GraphQL AST', e);
    }
  }, [onPrunedChange]);

  const commitMasterAst = (newAst: DocumentNode, newDisabled: Set<string>) => {
    try {
      const newQuery = print(newAst);
      setLastPrinted(newQuery); // Prevent re-parse loop
      onChange(newQuery);
      commitPrunedChanges(newAst, newDisabled);
    } catch(e) {
      console.error(e);
    }
  };

  const updateAst = (path: ReadonlyArray<string | number>, updater: (node: any) => void) => {
    if (!masterAst) return;
    const newAst = JSON.parse(JSON.stringify(masterAst));
    let current = newAst;
    for (let i = 0; i < path.length; i++) {
      current = current[path[i]];
    }
    updater(current);
    setMasterAst(newAst);
    commitMasterAst(newAst, disabledPaths);
  };

  const togglePath = (pathStr: string) => {
    if (!masterAst) return;
    const newDisabled = new Set(disabledPaths);
    if (newDisabled.has(pathStr)) {
      newDisabled.delete(pathStr);
    } else {
      newDisabled.add(pathStr);
    }
    setDisabledPaths(newDisabled);
    commitPrunedChanges(masterAst, newDisabled);
  };

  const handleRenameCommit = (path: ReadonlyArray<string | number>) => {
    if (editingPath && editValue.trim()) {
      updateAst(path, (node) => {
        if (node.name) {
          node.name.value = editValue.trim();
        }
      });
    }
    setEditingPath(null);
  };

  const handleAddField = (path: ReadonlyArray<string | number>) => {
    const fieldName = prompt('New field name:');
    if (!fieldName) return;
    updateAst(path, (node) => {
      if (!node.selectionSet) {
        node.selectionSet = { kind: 'SelectionSet', selections: [] };
      }
      node.selectionSet.selections.push({
        kind: 'Field',
        name: { kind: 'Name', value: fieldName }
      });
    });
  };

  const handleEditArgs = (path: ReadonlyArray<string | number>) => {
    const argsStr = prompt('Enter arguments (e.g. id: 123, status: "ACTIVE"):');
    if (argsStr === null) return;
    try {
      // Dummy parse to extract argument AST nodes
      const dummyQuery = `query { dummy(${argsStr}) }`;
      const parsedDummy = parse(dummyQuery);
      const dummyField = (parsedDummy.definitions[0] as OperationDefinitionNode).selectionSet.selections[0] as FieldNode;
      const newArgs = dummyField.arguments;
      updateAst(path, (node) => {
        node.arguments = newArgs;
      });
    } catch (e) {
      alert('Invalid argument syntax');
    }
  };

  const renderAstNode = (node: ASTNode, path: ReadonlyArray<string | number>): React.ReactNode => {
    const pathStr = path.join('.');
    const isDisabled = disabledPaths.has(pathStr);

    if (node.kind === 'OperationDefinition') {
      const op = node as OperationDefinitionNode;
      const name = op.name ? op.name.value : 'Anonymous Operation';
      return (
        <div key={pathStr} style={{ marginLeft: 12, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={!isDisabled} onChange={() => togglePath(pathStr)} />
            <span style={{ color: 'var(--accent-yellow)', fontWeight: 'bold' }}>{op.operation} {name}</span>
            <button onClick={() => handleAddField(path)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>+ Add</button>
          </div>
          {!isDisabled && op.selectionSet && (
            <div style={{ marginLeft: 16, borderLeft: '1px dashed var(--border-color)' }}>
              {op.selectionSet.selections.map((sel, idx) => renderAstNode(sel, [...path, 'selectionSet', 'selections', idx]))}
            </div>
          )}
        </div>
      );
    }

    if (node.kind === 'Field') {
      const field = node as FieldNode;
      const name = field.alias ? `${field.alias.value}: ${field.name.value}` : field.name.value;
      const hasChildren = field.selectionSet && field.selectionSet.selections.length > 0;
      
      return (
        <div key={pathStr} style={{ marginLeft: 12, marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isDisabled ? 0.5 : 1 }}>
            <input type="checkbox" checked={!isDisabled} onChange={() => togglePath(pathStr)} />
            {editingPath === pathStr ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={() => handleRenameCommit(path)}
                onKeyDown={e => e.key === 'Enter' && handleRenameCommit(path)}
                style={{ background: 'var(--bg-darker)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '2px 4px', fontSize: 12, outline: 'none' }}
              />
            ) : (
              <span 
                style={{ color: 'var(--text-primary)', cursor: 'text' }}
                onClick={() => { setEditingPath(pathStr); setEditValue(field.name.value); }}
                title="Click to rename"
              >
                {name}
              </span>
            )}
            
            <button onClick={() => handleEditArgs(path)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-muted)', fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>
              (args)
            </button>
            <button onClick={() => handleAddField(path)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>
              + Add
            </button>
          </div>
          {!isDisabled && hasChildren && (
            <div style={{ marginLeft: 16, borderLeft: '1px dashed var(--border-color)' }}>
              {field.selectionSet!.selections.map((sel, idx) => renderAstNode(sel, [...path, 'selectionSet', 'selections', idx]))}
            </div>
          )}
        </div>
      );
    }

    if (node.kind === 'InlineFragment') {
      const frag = node as InlineFragmentNode;
      const cond = frag.typeCondition ? `... on ${frag.typeCondition.name.value}` : '...';
      return (
        <div key={pathStr} style={{ marginLeft: 12, marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isDisabled ? 0.5 : 1 }}>
            <input type="checkbox" checked={!isDisabled} onChange={() => togglePath(pathStr)} />
            <span style={{ color: 'var(--accent-cyan)' }}>{cond}</span>
            <button onClick={() => handleAddField(path)} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>+ Add</button>
          </div>
          {!isDisabled && frag.selectionSet && (
            <div style={{ marginLeft: 16, borderLeft: '1px dashed var(--border-color)' }}>
              {frag.selectionSet.selections.map((sel, idx) => renderAstNode(sel, [...path, 'selectionSet', 'selections', idx]))}
            </div>
          )}
        </div>
      );
    }

    // fallback for unhandled node types (like FragmentSpread)
    if ((node as any).selectionSet) {
      return (
        <div key={pathStr} style={{ marginLeft: 12, marginTop: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: isDisabled ? 0.5 : 1 }}>
            <input type="checkbox" checked={!isDisabled} onChange={() => togglePath(pathStr)} />
            <span style={{ color: 'var(--text-secondary)' }}>{node.kind}</span>
          </div>
          {!isDisabled && (
            <div style={{ marginLeft: 16, borderLeft: '1px dashed var(--border-color)' }}>
              {(node as any).selectionSet.selections.map((sel: any, idx: number) => renderAstNode(sel, [...path, 'selectionSet', 'selections', idx]))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  if (!masterAst) {
    return <div style={{ color: 'var(--accent-red)', fontSize: 11, padding: 8 }}>Invalid GraphQL Query. Please fix syntax in Raw tab to use Tree mode.</div>;
  }

  return (
    <div style={{ padding: '8px 0', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
      {masterAst.definitions.map((def, idx) => renderAstNode(def, ['definitions', idx]))}
    </div>
  );
};

// --- Generic JSON Editor Components ---

interface JsonNodeProps {
  name: string | null;
  value: any;
  onChange: (newValue: any) => void;
  onPrunedChange: (newPrunedValue: any) => void;
  onDelete?: () => void;
  isRoot?: boolean;
}

const JsonNode: React.FC<JsonNodeProps> = ({ name, value, onChange, onPrunedChange, onDelete, isRoot }) => {
  const [expanded, setExpanded] = useState(true);
  const [prunedChildren, setPrunedChildren] = useState<Record<string, any>>({});

  useEffect(() => {
    // Initialize pruned children to value
    if (value !== null && typeof value === 'object') {
      const initialPruned = Array.isArray(value) ? [...value] : { ...value };
      setPrunedChildren(initialPruned);
    }
  }, [value]);

  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);

  // Check if this string value looks like GraphQL
  const isGraphQLString = typeof value === 'string' && 
    (name === 'query' || name === 'mutation' || value.trim().startsWith('query ') || value.trim().startsWith('mutation '));

  if (isGraphQLString) {
    let isValidGraphql = false;
    try {
      parse(value);
      isValidGraphql = true;
    } catch(e) {}

    if (isValidGraphql) {
      return (
        <div style={{ marginLeft: isRoot ? 0 : 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            {onDelete && (
              <button onClick={onDelete} style={{ color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>✕</button>
            )}
            {name && <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>"{name}":</span>}
            <div style={{ flex: 1, background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '4px 8px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>GraphQL AST Editor</div>
              <GraphQLTree queryStr={value} onChange={onChange} onPrunedChange={onPrunedChange} />
            </div>
          </div>
        </div>
      );
    }
  }

  if (isObject || isArray) {
    const keys = Object.keys(value);
    
    const handleChildChange = (k: string | number, newChildValue: any) => {
      const newValue = isArray ? [...value] : { ...value };
      (newValue as any)[k] = newChildValue;
      onChange(newValue);
    };

    const handleChildPrunedChange = (k: string | number, newChildPrunedValue: any) => {
      const newPruned = isArray ? [...(Array.isArray(prunedChildren) ? prunedChildren : value)] : { ...prunedChildren };
      (newPruned as any)[k] = newChildPrunedValue;
      setPrunedChildren(newPruned);
      onPrunedChange(newPruned);
    };

    const handleChildDelete = (k: string | number) => {
      if (isArray) {
        const newValue = [...value];
        newValue.splice(k as number, 1);
        onChange(newValue);
      } else {
        const newValue = { ...value };
        delete newValue[k];
        onChange(newValue);
      }
    };

    const handleAddChild = () => {
      if (isArray) {
        const newValue = [...value, ""];
        onChange(newValue);
      } else {
        const k = prompt('New field name:');
        if (k) {
          const newValue = { ...value, [k]: "" };
          onChange(newValue);
        }
      }
    };

    return (
      <div style={{ marginLeft: isRoot ? 0 : 16, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onDelete && (
            <button onClick={onDelete} style={{ color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕</button>
          )}
          <button 
            onClick={() => setExpanded(!expanded)} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 10, width: 12 }}
          >
            {expanded ? '▼' : '▶'}
          </button>
          {name && <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>"{name}":</span>}
          <span style={{ color: 'var(--text-secondary)' }}>{isArray ? `Array(${keys.length})` : `{ } Object`}</span>
          <button onClick={handleAddChild} style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-primary)', fontSize: 10, padding: '1px 4px', cursor: 'pointer' }}>+ Add</button>
        </div>
        {expanded && (
          <div style={{ borderLeft: '1px dashed var(--border-color)', marginLeft: 6, paddingLeft: 4, marginTop: 4 }}>
            {keys.map((k) => (
              <JsonNode 
                key={k} 
                name={isArray ? null : k} 
                value={(value as any)[k]} 
                onChange={(v) => handleChildChange(k, v)}
                onPrunedChange={(v) => handleChildPrunedChange(k, v)}
                onDelete={() => handleChildDelete(k)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Primitive value
  return (
    <div style={{ marginLeft: isRoot ? 0 : 16, marginBottom: 4, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      {onDelete && (
        <button onClick={onDelete} style={{ color: 'var(--accent-red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}>✕</button>
      )}
      {name && <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold', marginTop: 4 }}>"{name}":</span>}
      <textarea
        value={typeof value === 'string' ? value : JSON.stringify(value)}
        onChange={(e) => {
          let val: any = e.target.value;
          try {
            // attempt to parse numbers/booleans if it matches strictly, otherwise keep as string
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (val === 'null') val = null;
            else if (!isNaN(Number(val)) && val !== '') val = Number(val);
          } catch(err) {}
          onChange(val);
          onPrunedChange(val);
        }}
        style={{
          flex: 1,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          minHeight: '26px',
          resize: 'vertical'
        }}
      />
    </div>
  );
};

// --- Main Editor ---

interface NestedBodyEditorProps {
  body: string;
  onChange: (newBody: string) => void;
  onPrunedChange: (newPrunedBody: string) => void;
}

export default function NestedBodyEditor({ body, onChange, onPrunedChange }: NestedBodyEditorProps) {
  const [parsed, setParsed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!body) {
      setParsed(null);
      setError(null);
      return;
    }
    try {
      const p = JSON.parse(body);
      setParsed(p);
      setError(null);
    } catch (e) {
      setError('Invalid JSON in request body. Fix it in the Raw tab first to use Tree mode.');
    }
  }, [body]);

  if (error) {
    return <div style={{ color: 'var(--accent-red)', padding: 12, fontSize: 12 }}>{error}</div>;
  }

  if (parsed === null) return null;

  const handleRootChange = (newValue: any) => {
    onChange(JSON.stringify(newValue, null, 2));
  };

  const handleRootPrunedChange = (newPrunedValue: any) => {
    onPrunedChange(JSON.stringify(newPrunedValue, null, 2));
  };

  return (
    <div style={{ padding: 12, flex: 1, overflowY: 'auto' }}>
      <JsonNode name={null} value={parsed} onChange={handleRootChange} onPrunedChange={handleRootPrunedChange} isRoot={true} />
    </div>
  );
}
