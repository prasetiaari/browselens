import { useState, useEffect } from 'react';
import type { CapturedRequest } from '../../shared/types';

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
function normalizeJsUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.search = '';
    url.hash = '';
    let pathname = url.pathname;
    pathname = pathname.replace(/[.-][a-zA-Z0-9_-]{6,30}(?=\.js$)/, '');
    return url.origin + pathname;
  } catch {
    return urlStr.split('?')[0];
  }
}

interface Props {
  initialTab?: 'base64' | 'jwt' | 'encoder' | 'csrf' | 'urlparser' | 'crypto' | 'ssrf' | 'highlighter' | 'graphql' | 'jsauditor' | null;
  initialBase64?: string;
  initialJwt?: string;
  requests?: CapturedRequest[];
}

type ToolType = 'base64' | 'jwt' | 'encoder' | 'csrf' | 'urlparser' | 'crypto' | 'ssrf' | 'highlighter' | 'graphql' | 'jsauditor';

export default function ToolsPanel({ initialTab = null, initialBase64 = '', initialJwt = '', requests = [] }: Props) {
  // activeTool can be null (Dashboard grid) or a specific ToolType (Fullscreen popup overlay)
  const [activeTool, setActiveTool] = useState<ToolType | null>(initialTab);
  const [showQuickSwitch, setShowQuickSwitch] = useState(false);
  const [showEncModeDropdown, setShowEncModeDropdown] = useState(false);

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

  // --- 8. DOM Element Visualizer States ---
  const [highlighterActive, setHighlighterActive] = useState(false);

  // --- 9. GraphQL Traffic Analyzer States & Helpers ---
  const [selectedGraphqlReqId, setSelectedGraphqlReqId] = useState<string | null>(null);
  const [graphqlTab, setGraphqlTab] = useState<'live' | 'history'>('live');
  const [sessionStartTime] = useState(() => Date.now());

  // --- 10. JS Source Auditor States, Helpers & Downloader Routines ---
  const [selectedJsReqId, setSelectedJsReqId] = useState<string | null>(null);
  const [jsTab, setJsTab] = useState<'secrets' | 'endpoints' | 'vulns' | 'code'>('secrets');
  const [customJsInput, setCustomJsInput] = useState('');
  const [fetchingJsId, setFetchingJsId] = useState<string | null>(null);
  const [bulkFetching, setBulkFetching] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // Static secrets extraction patterns
  const scanSecrets = (code: string) => {
    const results: { label: string; value: string; match: string }[] = [];
    const patterns = [
      { label: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/g },
      { label: 'AWS Secret Access Key', regex: /[^A-Za-z0-9/+=]([A-Za-z0-9/+=]{40})[^A-Za-z0-9/+=]/g },
      { label: 'Google API Key / Firebase', regex: /AIzaSy[A-Za-z0-9_-]{33}/g },
      { label: 'Slack Webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9_]+\/B[A-Z0-9_]+\/[A-Za-z0-9_]+/g },
      { label: 'Generic Bearer Token', regex: /bearer\s+["'\`]?([A-Za-z0-9\-._~\+\/]+=*)["'\`]?/gi },
      { label: 'Mailgun API Key', regex: /key-[0-9a-f]{32}/g },
      { label: 'Stripe API Key', regex: /sk_live_[0-9a-zA-Z]{24}/g },
      { label: 'S3 Cloud Storage Bucket', regex: /[a-z0-9.-]+\.s3\.amazonaws\.com/g },
      { label: 'Database Connection String', regex: /(mongodb|postgres|mysql|redis|amqp):\/\/[A-Za-z0-9_.:-]+@[A-Za-z0-9.-]+/gi },
      { label: 'JWT Authentication Token', regex: /ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g }
    ];

    patterns.forEach(p => {
      let match;
      p.regex.lastIndex = 0; // reset RegExp index state
      while ((match = p.regex.exec(code)) !== null) {
        const fullMatch = match[0];
        const val = match[1] || fullMatch;
        // Prevent duplicate logs
        if (!results.some(r => r.value === val)) {
          results.push({ label: p.label, value: val, match: fullMatch.substring(0, 100) });
        }
      }
    });

    return results;
  };

  // Static API endpoints extraction patterns
  const extractEndpoints = (code: string) => {
    const results: { path: string; match: string }[] = [];
    // Catch relative endpoint patterns (/api/v1/..., /auth/...)
    const relativeRegex = /"(\/(?:api|v[0-9]|auth|user|settings|admin|get|post|delete|update)[A-Za-z0-9_./-]*)"/g;
    // Catch absolute external/subdomain HTTP patterns
    const absoluteRegex = /"(https?:\/\/[A-Za-z0-9_.-]+\.[a-z]{2,6}(?:\/[A-Za-z0-9_./-]*)*)"/g;

    let match;
    relativeRegex.lastIndex = 0;
    while ((match = relativeRegex.exec(code)) !== null) {
      const path = match[1];
      if (path.length > 2 && !results.some(r => r.path === path)) {
        results.push({ path, match: match[0] });
      }
    }

    absoluteRegex.lastIndex = 0;
    while ((match = absoluteRegex.exec(code)) !== null) {
      const path = match[1];
      if (path.length > 2 && !results.some(r => r.path === path)) {
        results.push({ path, match: match[0] });
      }
    }

    return results;
  };

  // Client-Side Dangerous Functions Auditing
  const findDangerousFunctions = (code: string) => {
    const results: { label: string; codeSnippet: string; desc: string }[] = [];
    const signatures = [
      { label: 'Unsafe eval() execution', regex: /eval\s*\(/g, desc: 'Executes text strings as JS code, enabling Cross-Site Scripting (XSS).' },
      { label: 'Unsafe DOM writing (innerHTML)', regex: /\.innerHTML\s*=/g, desc: 'Direct raw HTML injection can lead to DOM-based XSS if inputs are unescaped.' },
      { label: 'Dynamic timer execution', regex: /(setTimeout|setInterval)\s*\(\s*["'\`]/g, desc: 'Passing strings to timers acts identically to eval() and poses injection risks.' },
      { label: 'Unsafe dynamic scripts creation', regex: /document\.createElement\s*\(\s*['"\`]script['"\`]\s*\)/g, desc: 'Dynamically generated scripts allow remote external JS payload inclusion.' },
      { label: 'Insecure postMessage listener', regex: /\.addEventListener\s*\(\s*['"\`]message['"\`]/g, desc: 'Requires origin checking during messages reception to prevent cross-origin takeover.' }
    ];

    signatures.forEach(sig => {
      let match;
      sig.regex.lastIndex = 0;
      while ((match = sig.regex.exec(code)) !== null) {
        const start = Math.max(0, match.index - 40);
        const end = Math.min(code.length, match.index + sig.label.length + 50);
        const snippet = code.substring(start, end).replace(/\s+/g, ' ').trim();
        results.push({
          label: sig.label,
          codeSnippet: `... ${snippet} ...`,
          desc: sig.desc
        });
      }
    });

    return results;
  };

  // Background silent fetch bypass
  const fetchJsSource = async (id: string, url: string) => {
    setFetchingJsId(id);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      // Store in project database
      chrome.runtime.sendMessage({
        type: 'UPDATE_REQUEST_BODY',
        payload: { id, responseBody: body }
      });
    } catch (err) {
      console.error('[BrowseLens] Background fetch failed for:', url, err);
      alert(`Silent downloader failed: ${err instanceof Error ? err.message : String(err)}. Check browser console or network tab.`);
    } finally {
      setFetchingJsId(null);
    }
  };

  // Asynchronous parallel harvester
  const fetchAndAuditAllJs = async (jsRequests: CapturedRequest[]) => {
    const emptyJs = jsRequests.filter(r => !r.responseBody || r.responseBody.startsWith('[Response body discarded'));
    if (emptyJs.length === 0) {
      alert('All scripts are already downloaded and audited!');
      return;
    }
    setBulkFetching(true);
    try {
      await Promise.all(
        emptyJs.map(r => 
          fetch(r.url)
            .then(res => {
              if (res.ok) return res.text();
              throw new Error(`HTTP ${res.status}`);
            })
            .then(body => {
              chrome.runtime.sendMessage({
                type: 'UPDATE_REQUEST_BODY',
                payload: { id: r.id, responseBody: body }
              });
            })
            .catch(err => console.warn(`Bulk download failed for ${r.url}:`, err))
        )
      );
      alert(`Bulk Harvest completed! Synchronized ${emptyJs.length} JS file downloads.`);
    } catch (err) {
      console.error('[BrowseLens] Parallel bulk harvest failed:', err);
    } finally {
      setBulkFetching(false);
    }
  };

  const getGraphqlDetails = (req: CapturedRequest) => {
    let operationName = 'Anonymous';
    let operationType: 'query' | 'mutation' | 'subscription' = 'query';
    let queryStr = '';
    let variablesStr = '';
    let isIntrospection = false;

    // 1. Try to extract from requestBody
    if (req.requestBody) {
      try {
        const parsed = JSON.parse(req.requestBody);
        if (parsed.operationName) {
          operationName = parsed.operationName;
        }
        if (parsed.query) {
          queryStr = parsed.query;
        }
        if (parsed.variables) {
          variablesStr = JSON.stringify(parsed.variables, null, 2);
        }
      } catch {
        // Fallback parsing if JSON parsing fails (e.g. multipart or query-string format)
        const opNameMatch = req.requestBody.match(/"operationName"\s*:\s*"([^"]+)"/);
        if (opNameMatch) operationName = opNameMatch[1];

        const queryMatch = req.requestBody.match(/"query"\s*:\s*"([^"]+)"/);
        if (queryMatch) queryStr = queryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      }
    }

    // 2. Try to extract from URL if queryStr is still empty
    if (!queryStr) {
      try {
        const urlObj = new URL(req.url);
        const queryParam = urlObj.searchParams.get('query');
        if (queryParam) queryStr = queryParam;
        
        const opParam = urlObj.searchParams.get('operationName');
        if (opParam) operationName = opParam;
        
        const varsParam = urlObj.searchParams.get('variables');
        if (varsParam) variablesStr = varsParam;
      } catch {}
    }

    // 3. Determine operation type (query vs mutation vs subscription)
    if (queryStr) {
      const normalizedQuery = queryStr.trim().toLowerCase();
      if (normalizedQuery.startsWith('mutation')) {
        operationType = 'mutation';
      } else if (normalizedQuery.startsWith('subscription')) {
        operationType = 'subscription';
      } else {
        operationType = 'query';
      }

      // Check if it's an introspection query
      if (
        normalizedQuery.includes('__schema') ||
        normalizedQuery.includes('__type') ||
        normalizedQuery.includes('__typename')
      ) {
        isIntrospection = true;
      }
    }

    return {
      operationName,
      operationType,
      queryStr: queryStr || req.requestBody || '',
      variablesStr: variablesStr || '{}',
      isIntrospection
    };
  };

  const togglePageHighlighter = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      alert('This tool is only available in the Chrome Extension environment.');
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab?.id) {
        alert('Could not find the active browser tab.');
        return;
      }

      if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('about:'))) {
        alert('Cannot inspect browser internal pages (chrome://). Please open a normal website first!');
        return;
      }

      chrome.tabs.sendMessage(activeTab.id, {
        type: 'BROWSELENS_TOGGLE_HIGHLIGHTS'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          alert('Could not communicate with the page. Please visit a webpage and reload it to activate BrowseLens highlighter!');
          return;
        }
        if (response) {
          setHighlighterActive(response.active);
        } else {
          setHighlighterActive(prev => !prev);
        }
      });
    });
  };



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
    { id: 'highlighter', label: 'DOM Visual Highlighter', icon: '🎯', desc: 'Scan and visually highlight all forms & links on the active page.' },
    { id: 'graphql', label: 'GraphQL Traffic Analyzer', icon: '🧬', desc: 'Auto-discover GraphQL operations, query types, variables, and audit introspection vulnerabilities.' },
    { id: 'jsauditor', label: 'JS Source Auditor & Leak Finder', icon: '🔍', desc: 'Auto-scan static scripts dynamically. Dissect AWS tokens, relative APIs, and find client-side vulnerabilities.' }
  ] as const;

  return (
    <div className="tools-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      
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
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
            overflowY: 'visible',
            paddingBottom: 40,
            paddingTop: 10
          }}>
            {toolsList.map(t => {
              const isHovered = t.id === hoveredCardId;
              return (
                <div
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  onMouseEnter={() => setHoveredCardId(t.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  style={{
                    background: isHovered 
                      ? 'rgba(0, 120, 215, 0.15)' 
                      : 'transparent',
                    border: isHovered 
                      ? '1px solid rgba(0, 120, 215, 0.45)' 
                      : '1px solid transparent',
                    borderRadius: 6,
                    padding: '16px 8px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 10,
                    transition: 'all 0.15s ease',
                    position: 'relative',
                    textAlign: 'center',
                    boxSizing: 'border-box'
                  }}
                >
                  {/* Icon representation resembling a desktop shortcut */}
                  <div style={{
                    fontSize: 46,
                    background: isHovered ? 'rgba(0, 120, 215, 0.22)' : 'rgba(255, 255, 255, 0.02)',
                    width: 80,
                    height: 80,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    border: `1px solid ${isHovered ? 'rgba(0, 120, 215, 0.35)' : 'rgba(255, 255, 255, 0.04)'}`,
                    transition: 'transform 0.15s ease',
                    transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                    boxShadow: isHovered ? '0 0 12px rgba(0, 120, 215, 0.35)' : 'none'
                  }}>
                    {t.icon}
                  </div>

                  {/* Desktop label below icon */}
                  <span style={{ 
                    fontSize: 12, 
                    fontWeight: 700,
                    color: isHovered ? '#00e5ff' : 'var(--text-primary)',
                    lineHeight: '1.35',
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    transition: 'color 0.15s ease'
                  }}>
                    {t.label}
                  </span>

                  {/* Windows Infotip-style Tooltip popup */}
                  {isHovered && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: 8,
                      background: 'rgba(15, 23, 42, 0.97)',
                      border: '1px solid rgba(0, 229, 255, 0.38)',
                      borderRadius: 6,
                      padding: '8px 12px',
                      width: 170,
                      color: '#e2e8f0',
                      fontSize: 10.5,
                      lineHeight: '1.45',
                      textAlign: 'left',
                      zIndex: 999999,
                      boxShadow: '0 6px 20px rgba(0,0,0,0.7), 0 0 10px rgba(0,229,255,0.15)',
                      pointerEvents: 'none'
                    }}>
                      <div style={{ fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: 4, fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 2 }}>
                        {t.label}
                      </div>
                      {t.desc}
                    </div>
                  )}
                </div>
              );
            })}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
              {/* Sleek Custom Selector */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowQuickSwitch(!showQuickSwitch)}
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    fontSize: 10,
                    padding: '5px 10px',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>{toolsList.find(t => t.id === activeTool)?.label}</span>
                  <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>▼</span>
                </button>
                {showQuickSwitch && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                    zIndex: 100000,
                    minWidth: 170,
                    overflow: 'hidden'
                  }}>
                    {toolsList.map(t => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setActiveTool(t.id);
                          setShowQuickSwitch(false);
                        }}
                        style={{
                          padding: '8px 12px',
                           fontSize: 10,
                          cursor: 'pointer',
                          color: activeTool === t.id ? 'var(--accent-cyan)' : 'var(--text-primary)',
                          background: activeTool === t.id ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = activeTool === t.id ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                      >
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <button
                      onClick={() => setShowEncModeDropdown(!showEncModeDropdown)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        fontSize: 11,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 600
                      }}
                    >
                      <span>
                        {encMode === 'url' && 'URL Encoding'}
                        {encMode === 'html' && 'HTML Entities'}
                        {encMode === 'hex' && 'Hexadecimal'}
                        {encMode === 'unicode' && 'Unicode Escape'}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
                    </button>
                    {showEncModeDropdown && (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        width: '100%',
                        marginBottom: 4,
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-sm)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                        zIndex: 100000,
                        overflow: 'hidden'
                      }}>
                        {([
                          { value: 'url', label: 'URL Encoding' },
                          { value: 'html', label: 'HTML Entities' },
                          { value: 'hex', label: 'Hexadecimal' },
                          { value: 'unicode', label: 'Unicode Escape' }
                        ]).map(m => (
                          <div
                            key={m.value}
                            onClick={() => {
                              setEncMode(m.value as any);
                              setShowEncModeDropdown(false);
                            }}
                            style={{
                              padding: '10px 12px',
                              fontSize: 11,
                              cursor: 'pointer',
                              color: encMode === m.value ? 'var(--accent-cyan)' : 'var(--text-primary)',
                              background: encMode === m.value ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.04)'}
                            onMouseLeave={e => e.currentTarget.style.background = encMode === m.value ? 'rgba(0, 229, 255, 0.08)' : 'transparent'}
                          >
                            {m.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleEncodeDecode('encode')} className="tool-btn-primary" style={{ padding: '9px 16px', height: 38 }}>🔒 Encode</button>
                  <button onClick={() => handleEncodeDecode('decode')} className="tool-btn-success" style={{ padding: '9px 16px', height: 38 }}>🔓 Decode</button>
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
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {['POST', 'GET'].map(m => (
                      <button
                        key={m}
                        onClick={() => setCsrfMethod(m as any)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: csrfMethod === m ? 'rgba(0, 229, 255, 0.15)' : 'var(--bg-secondary)',
                          border: csrfMethod === m ? '1px solid var(--accent-cyan)' : '1px solid var(--border-primary)',
                          color: csrfMethod === m ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: 11,
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
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

             {/* --- DOM ELEMENT VISUALIZER WORKSPACE --- */}
            {activeTool === 'highlighter' && (
              <div className="highlighter-tool" style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 44 }}>🎯</div>
                <div>
                  <h3 style={{ margin: '0 0 6px 0', color: 'var(--accent-cyan)', fontSize: 14 }}>DOM Element Visualizer</h3>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    Inject real-time visual overlays directly into the active browser tab to locate entry points, input forms, and hyperlinks instantly.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                  <button
                    onClick={togglePageHighlighter}
                    className={highlighterActive ? "tool-btn-success" : "tool-btn-primary"}
                    style={{
                      padding: '12px 20px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 6,
                      width: '100%',
                      maxWidth: 320,
                      boxShadow: highlighterActive ? '0 0 20px rgba(0, 255, 136, 0.3)' : '0 0 16px rgba(0, 229, 255, 0.15)',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    {highlighterActive ? "🟢 Visual Highlights: ACTIVE" : "🎯 Inject Highlights on Page"}
                  </button>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: 14, textAlign: 'left' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 11, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 6 }}>💡 Visual Indicators Guide</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: '2px dashed #ff3366', background: 'rgba(255,51,102,0.1)', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#ff3366' }}>Input & Action Forms</span>
                        <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                          Forms will be outlined in **dashed neon red** with a hovering tag displaying `[METHOD]` and `[action]` targets. Perfect for targeting CSRF, XSS, or SQLi entry points.
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: '2px dashed #00e5ff', background: 'rgba(0,229,255,0.1)', flexShrink: 0, marginTop: 1 }} />
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 'bold', color: '#00e5ff' }}>Hyperlinks & Redirects</span>
                        <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                          Hyperlinks will be outlined in **dashed neon cyan** with a hovering tag displaying the exact target `[href]`. Helps audit target URLs, open redirects, or hidden pathways.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="tool-alert-warning" style={{ textAlign: 'left', lineHeight: 1.4 }}>
                  ⚠️ **Troubleshooting**: If highlights do not appear immediately, please reload the active webpage tab so Chrome can inject BrowseLens content script, then click the trigger button again!
                </div>
              </div>
            )}

            {/* --- GRAPHQL TRAFFIC ANALYZER WORKSPACE --- */}
            {activeTool === 'graphql' && (() => {
              const graphqlRequests = requests.filter(r => {
                // 1. Session start time boundary filter
                if (graphqlTab === 'live') {
                  if (r.timestamp < sessionStartTime) return false;
                } else {
                  if (r.timestamp >= sessionStartTime) return false;
                }

                // 2. Heuristic checks
                if (r.url && (r.url.toLowerCase().includes('/graphql') || r.url.toLowerCase().includes('graphql'))) return true;
                if (r.requestHeaders) {
                  const accept = (r.requestHeaders['Accept'] || r.requestHeaders['accept'] || '').toLowerCase();
                  const contentType = (r.requestHeaders['Content-Type'] || r.requestHeaders['content-type'] || '').toLowerCase();
                  if (accept.includes('graphql') || contentType.includes('graphql')) return true;
                }
                if (r.requestBody) {
                  const bodyStr = r.requestBody.toLowerCase();
                  if (bodyStr.includes('"query"') || bodyStr.includes('"operationname"')) return true;
                }
                return false;
              });

              const selectedReq = graphqlRequests.find(r => r.id === selectedGraphqlReqId);
              const details = selectedReq ? getGraphqlDetails(selectedReq) : null;

              const importToRepeater = () => {
                if (!selectedReq || !details) return;
                const headersObj: Record<string, string> = { ...selectedReq.requestHeaders };
                if (!headersObj['Content-Type'] && !headersObj['content-type']) {
                  headersObj['Content-Type'] = 'application/json';
                }
                
                const repeaterPayload = {
                  url: selectedReq.url,
                  method: selectedReq.method,
                  headers: headersObj,
                  body: selectedReq.requestBody || JSON.stringify({
                    query: details.queryStr,
                    operationName: details.operationName === 'Anonymous' ? undefined : details.operationName,
                    variables: JSON.parse(details.variablesStr || '{}')
                  }, null, 2)
                };

                window.dispatchEvent(new CustomEvent('repeater-import', { detail: repeaterPayload }));
                alert('GraphQL operation successfully imported to Repeater!');
              };

              return (
                <div className="graphql-tool" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 'calc(100vh - 120px)' }}>
                  
                  {/* Summary Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: 12, border: '1px solid var(--border-primary)', borderRadius: 8 }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: 13, color: 'var(--accent-cyan)' }}>🧬 GraphQL Traffic Dissector</h4>
                      <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>
                        Natively discover, dissect, and audit all GraphQL queries without sending payload tokens to the cloud.
                      </p>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 4, color: 'var(--text-secondary)' }}>
                      Total Captured: <span style={{ color: 'var(--accent-cyan)' }}>{graphqlRequests.length}</span>
                    </div>
                  </div>

                  {/* Two Panel Layout */}
                  <div style={{ display: 'flex', flex: 1, gap: 16, minHeight: 0 }}>
                    
                    {/* Left Panel: Operations List */}
                    <div style={{
                      flex: selectedGraphqlReqId ? 1 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      borderRight: selectedGraphqlReqId ? '1px solid var(--border-primary)' : 'none',
                      paddingRight: selectedGraphqlReqId ? 16 : 0,
                      maxHeight: 'calc(100vh - 180px)',
                      overflowY: 'auto'
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)' }}>
                            Operations
                          </span>
                          
                          <div style={{
                            display: 'flex',
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 6,
                            padding: 2,
                            gap: 2
                          }}>
                            <button
                              onClick={() => {
                                setGraphqlTab('live');
                                setSelectedGraphqlReqId(null);
                              }}
                              style={{
                                background: graphqlTab === 'live' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                border: 'none',
                                color: graphqlTab === 'live' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                fontSize: 8.5,
                                fontWeight: 700,
                                padding: '3px 6px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                            >
                              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#ff3366' }} />
                              Live
                            </button>
                            <button
                              onClick={() => {
                                setGraphqlTab('history');
                                setSelectedGraphqlReqId(null);
                              }}
                              style={{
                                background: graphqlTab === 'history' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                                border: 'none',
                                color: graphqlTab === 'history' ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                fontSize: 8.5,
                                fontWeight: 700,
                                padding: '3px 6px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                            >
                              📁 History
                            </button>
                          </div>
                        </div>
                      </div>

                      {graphqlRequests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-primary)', borderRadius: 8, color: 'var(--text-muted)' }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2 }}>No GraphQL Traffic Discovered</div>
                          <div style={{ fontSize: 10, lineHeight: 1.3 }}>Interact with the target website or reload pages to capture queries.</div>
                        </div>
                      ) : (
                        graphqlRequests.map(r => {
                          const reqDetails = getGraphqlDetails(r);
                          const isSelected = r.id === selectedGraphqlReqId;

                          const badgeColor = 
                            reqDetails.operationType === 'mutation' 
                              ? '#d152ff' 
                              : reqDetails.operationType === 'subscription'
                              ? '#ffb800' 
                              : '#00e5ff'; 

                          return (
                            <div
                              key={r.id}
                              onClick={() => setSelectedGraphqlReqId(isSelected ? null : r.id)}
                              style={{
                                background: isSelected ? 'rgba(0, 229, 255, 0.05)' : 'var(--bg-secondary)',
                                border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-primary)'}`,
                                borderRadius: 6,
                                padding: 10,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6
                              }}
                              onMouseEnter={e => { if(!isSelected) e.currentTarget.style.border = '1px solid rgba(0, 229, 255, 0.3)'; }}
                              onMouseLeave={e => { if(!isSelected) e.currentTarget.style.border = '1px solid var(--border-primary)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{
                                    fontSize: 8,
                                    fontWeight: 800,
                                    padding: '2px 5px',
                                    borderRadius: 3,
                                    background: `${badgeColor}15`,
                                    color: badgeColor,
                                    border: `1px solid ${badgeColor}30`,
                                    textTransform: 'uppercase'
                                  }}>
                                    {reqDetails.operationType}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                    {reqDetails.operationName}
                                  </span>
                                </div>
                                <span style={{ fontSize: 9, color: r.status !== undefined && r.status >= 200 && r.status < 300 ? '#00ff88' : '#ff3366', fontFamily: 'monospace' }}>
                                  {r.status || 'PENDING'}
                                </span>
                              </div>
                              
                              <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {reqDetails.queryStr.replace(/\s+/g, ' ')}
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, color: 'var(--text-muted)' }}>
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                  {(() => { try { return new URL(r.url).pathname; } catch { return r.url || ''; } })()}
                                </span>
                                <span>
                                  {new Date(r.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Right Panel: Selected Operation Inspector */}
                    {selectedReq && details && (
                      <div style={{
                        flex: 1.2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        maxHeight: 'calc(100vh - 180px)',
                        overflowY: 'auto',
                        background: 'rgba(255, 255, 255, 0.01)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 8,
                        padding: 16
                      }}>
                        
                        {/* Title Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', fontWeight: 800 }}>Operation Inspector</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-cyan)' }}>{details.operationName}</span>
                          </div>
                          
                          <button
                            onClick={importToRepeater}
                            className="tool-btn-primary"
                            style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, borderRadius: 4 }}
                          >
                            🚀 Send to Repeater
                          </button>
                        </div>

                        {/* Introspection Security Audit Card */}
                        <div style={{
                          background: details.isIntrospection ? 'rgba(255, 51, 102, 0.08)' : 'rgba(0, 229, 255, 0.03)',
                          border: `1px solid ${details.isIntrospection ? 'rgba(255, 51, 102, 0.3)' : 'rgba(0, 229, 255, 0.15)'}`,
                          borderRadius: 6,
                          padding: 10
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: details.isIntrospection ? '#ff3366' : 'var(--accent-cyan)', marginBottom: 4 }}>
                            {details.isIntrospection ? '⚠️ Security Issue: Schema Introspection Detected!' : '🛡️ GraphQL Security Advisory'}
                          </div>
                          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {details.isIntrospection 
                              ? 'This query attempts schema discovery (__schema/__type). Enabling introspection in production allows attackers to reconstruct the entire schema, database relations, and custom operations, accelerating target recon.'
                              : 'Check if Schema Introspection is enabled by sending an introspection query to the endpoint. If enabled, use tools like GraphQL Voyager to visually map the entire API landscape.'}
                          </p>
                          
                          {!details.isIntrospection && (
                            <button
                              onClick={() => {
                                const introQuery = `query IntrospectionQuery { __schema { queryType { name } mutationType { name } } }`;
                                navigator.clipboard.writeText(JSON.stringify({ query: introQuery }));
                                alert('Introspection query payload copied to clipboard!');
                              }}
                              className="tool-copy-trigger"
                              style={{ marginTop: 6, fontSize: 9, padding: '2px 6px' }}
                            >
                              📋 Copy Introspection Test Payload
                            </button>
                          )}
                        </div>

                        {/* GraphQL Query / Mutation Block */}
                        <div>
                          <label className="tool-inner-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span>GraphQL Query String</span>
                            <button onClick={() => handleCopy(details.queryStr)} className="tool-copy-trigger" style={{ fontSize: 9 }}>Copy Query</button>
                          </label>
                          <pre style={{
                            margin: 0,
                            padding: 10,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 6,
                            color: '#e2e8f0',
                            fontSize: 10.5,
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            maxHeight: 250,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
                            {details.queryStr}
                          </pre>
                        </div>

                        {/* GraphQL Variables Block */}
                        <div>
                          <label className="tool-inner-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span>Variables (JSON)</span>
                            <button onClick={() => handleCopy(details.variablesStr)} className="tool-copy-trigger" style={{ fontSize: 9 }}>Copy Variables</button>
                          </label>
                          <pre style={{
                            margin: 0,
                            padding: 10,
                            background: 'var(--bg-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: 6,
                            color: '#a0aec0',
                            fontSize: 10,
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            maxHeight: 120,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
                            {details.variablesStr}
                          </pre>
                        </div>

                        {/* Endpoint Details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10, borderTop: '1px solid var(--border-primary)', paddingTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Target Endpoint:</span>
                            <span style={{ color: 'var(--text-primary)', wordBreak: 'break-all', textAlign: 'right', maxWidth: '70%', fontFamily: 'monospace' }}>{selectedReq.url}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Request Method:</span>
                            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selectedReq.method}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>MIME Type:</span>
                            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{selectedReq.mimeType || 'application/json'}</span>
                          </div>
                        </div>

                      </div>
                    )}

                  </div>
                </div>
              );
            })()}

            {/* 2c. JS Source Auditor Workspace Layout */}
            {activeTool === 'jsauditor' && (() => {
              // Get all capture scripts from request list
              const jsRequests = requests.filter(r => {
                const url = (r.url || '').toLowerCase();
                const mime = (r.mimeType || '').toLowerCase();
                return url.endsWith('.js') || url.includes('.js?') || mime.includes('javascript') || mime.includes('x-javascript');
              });

              // Deduplicate by normalized URL signature to prevent listing duplicates
              const uniqueJsRequests: CapturedRequest[] = [];
              jsRequests.forEach(r => {
                const norm = normalizeJsUrl(r.url);
                if (!uniqueJsRequests.some(u => normalizeJsUrl(u.url) === norm)) {
                  uniqueJsRequests.push(r);
                }
              });

              // Resolve selected JS script request details
              const selectedReq = selectedJsReqId 
                ? jsRequests.find(r => r.id === selectedJsReqId) 
                : null;

              // If custom code editor content is supplied, audit that instead
              const activeCode = customJsInput || (selectedReq?.responseBody || '');
              const hasEmptyBody = selectedReq && (!selectedReq.responseBody || selectedReq.responseBody.startsWith('[Response body discarded'));

              const secretsList = activeCode ? scanSecrets(activeCode) : [];
              const endpointsList = activeCode ? extractEndpoints(activeCode) : [];
              const vulnsList = activeCode ? findDangerousFunctions(activeCode) : [];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 50px)', padding: 16, boxSizing: 'border-box', overflow: 'hidden' }}>
                  
                  {/* Dashboard Header Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: 16, color: 'var(--accent-cyan)' }}>🔍 Client-Side Static Analysis</h3>
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>Scan JavaScript assets, extract relative endpoints, and check secrets leakage in real time.</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={() => fetchAndAuditAllJs(jsRequests)}
                        disabled={bulkFetching}
                        className="tool-btn-primary"
                        style={{
                          background: 'linear-gradient(135deg, #00e5ff 0%, #0088ff 100%)',
                          border: 'none',
                          padding: '8px 16px',
                          fontSize: 11.5,
                          fontWeight: 800,
                          borderRadius: 4,
                          color: '#000',
                          cursor: 'pointer',
                          opacity: bulkFetching ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        ⚡ {bulkFetching ? 'Downloading...' : 'Bulk Scan All JS'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
                    
                    {/* Left Column: Script bundle list */}
                    <div style={{
                      flex: 0.9,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      overflowY: 'auto',
                      maxHeight: 'calc(100vh - 120px)',
                      paddingRight: 4
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 6 }}>
                        <span>Captured Bundles ({uniqueJsRequests.length})</span>
                        <span style={{ fontSize: 11 }}>Click script file to audit</span>
                      </div>

                      {uniqueJsRequests.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-primary)', borderRadius: 8, color: 'var(--text-muted)' }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>No JavaScript Assets Captured</div>
                          <div style={{ fontSize: 11.5, lineHeight: 1.4 }}>Reload or browse the webpage to discover script sources.</div>
                        </div>
                      ) : (
                        uniqueJsRequests.map(r => {
                          const isSelected = r.id === selectedJsReqId;
                          const hasBody = r.responseBody && !r.responseBody.startsWith('[Response body discarded');
                          
                          // Quick pre-computations for listing badges
                          const previewCode = r.responseBody || '';
                          const secCount = previewCode ? scanSecrets(previewCode).length : 0;
                          const vulnCount = previewCode ? findDangerousFunctions(previewCode).length : 0;

                          return (
                            <div
                              key={r.id}
                              onClick={() => {
                                setCustomJsInput('');
                                setSelectedJsReqId(isSelected ? null : r.id);
                              }}
                              style={{
                                background: isSelected ? 'rgba(0, 229, 255, 0.05)' : 'var(--bg-secondary)',
                                border: `1px solid ${isSelected ? 'var(--accent-cyan)' : 'var(--border-primary)'}`,
                                borderRadius: 6,
                                padding: '12px 14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8
                              }}
                              onMouseEnter={e => { if(!isSelected) e.currentTarget.style.border = '1px solid rgba(0, 229, 255, 0.3)'; }}
                              onMouseLeave={e => { if(!isSelected) e.currentTarget.style.border = '1px solid var(--border-primary)'; }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ 
                                  fontSize: 12.5, 
                                  fontWeight: 700, 
                                  color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                                  wordBreak: 'break-all',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '75%'
                                }}>
                                  {(() => { try { return r.url.substring(r.url.lastIndexOf('/') + 1) || r.url; } catch { return r.url; } })()}
                                </span>
                                
                                <span style={{
                                  fontSize: 9.5,
                                  fontWeight: 800,
                                  padding: '3px 6px',
                                  borderRadius: 4,
                                  background: hasBody ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
                                  color: hasBody ? '#00ff88' : '#ffb800',
                                  border: `1px solid ${hasBody ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 184, 0, 0.2)'}`
                                }}>
                                  {hasBody ? 'DOWNLOADED' : 'PENDING'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {secCount > 0 && (
                                  <span style={{ fontSize: 9, fontWeight: 800, color: '#ff3366', background: 'rgba(255, 51, 102, 0.1)', padding: '2px 5px', borderRadius: 3, border: '1px solid rgba(255,51,102,0.2)' }}>
                                    🔒 {secCount} SECRETS
                                  </span>
                                )}
                                {vulnCount > 0 && (
                                  <span style={{ fontSize: 9, fontWeight: 800, color: '#ffb800', background: 'rgba(255, 184, 0, 0.1)', padding: '2px 5px', borderRadius: 3, border: '1px solid rgba(255, 184, 0, 0.2)' }}>
                                    ⚠️ {vulnCount} VULNS
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)' }}>
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                                  {r.url}
                                </span>
                                <span>
                                  {r.responseBodySize ? `${(r.responseBodySize / 1024).toFixed(1)} KB` : '0 KB'}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Right Column: Code audit analysis split-pane */}
                    <div style={{
                      flex: 1.2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      overflowY: 'auto',
                      maxHeight: 'calc(100vh - 120px)',
                      background: 'rgba(255, 255, 255, 0.01)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 8,
                      padding: 16
                    }}>
                      
                      {/* Code Source Switcher Menu */}
                      <div style={{ borderBottom: '1px solid var(--border-primary)', paddingBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 800 }}>Audit Analyzer</span>
                          {selectedReq && (
                            <span style={{ fontSize: 11.5, color: 'var(--accent-cyan)', fontFamily: 'monospace', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                              {selectedReq.url}
                            </span>
                          )}
                        </div>

                        {/* Sandboxed Paste Container */}
                        {!selectedReq && (
                          <div style={{ marginTop: 8 }}>
                            <label className="tool-inner-label" style={{ marginBottom: 4, display: 'block', fontSize: 12 }}>Or Paste Custom Script Snip:</label>
                            <textarea
                              value={customJsInput}
                              onChange={e => setCustomJsInput(e.target.value)}
                              placeholder="Paste obfuscated JS code or vendor scripts here to audit immediately offline..."
                              style={{
                                width: '100%',
                                height: 75,
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 6,
                                color: '#e2e8f0',
                                fontSize: 12,
                                fontFamily: 'monospace',
                                padding: 10,
                                boxSizing: 'border-box',
                                resize: 'none'
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Silent downloader loader when asset is empty */}
                      {selectedReq && hasEmptyBody && (
                        <div style={{
                          padding: '30px 16px',
                          textAlign: 'center',
                          background: 'rgba(255, 184, 0, 0.03)',
                          border: '1px dashed rgba(255, 184, 0, 0.25)',
                          borderRadius: 8,
                          margin: '8px 0'
                        }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
                          <h4 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 700, color: '#ffb800' }}>Empty/No Code Extracted</h4>
                          <p style={{ margin: '0 0 12px 0', fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                            This script has discarded body data in permanent store. Enable silent downloader to fetch background bundle context now.
                          </p>
                          <button
                            onClick={() => fetchJsSource(selectedReq.id, selectedReq.url)}
                            disabled={fetchingJsId === selectedReq.id}
                            className="tool-btn-primary"
                            style={{
                              background: '#ffb800',
                              border: 'none',
                              color: '#000',
                              padding: '8px 16px',
                              fontSize: 11.5,
                              fontWeight: 800,
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            {fetchingJsId === selectedReq.id ? 'Downloading...' : 'Download & Analyze Source Code'}
                          </button>
                        </div>
                      )}

                      {/* Display Audit Findings Categories Tabs */}
                      {(activeCode || selectedReq) && !hasEmptyBody && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                          
                          {/* Segmented Control Buttons */}
                          <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: 3, borderRadius: 6, border: '1px solid var(--border-primary)' }}>
                            {(['secrets', 'endpoints', 'vulns', 'code'] as const).map(tab => (
                              <button
                                key={tab}
                                onClick={() => setJsTab(tab)}
                                style={{
                                  flex: 1,
                                  background: jsTab === tab ? 'var(--bg-secondary)' : 'transparent',
                                  border: 'none',
                                  color: jsTab === tab ? 'var(--accent-cyan)' : 'var(--text-muted)',
                                  padding: '6px 0',
                                  borderRadius: 4,
                                  cursor: 'pointer',
                                  fontSize: 11.5,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  transition: 'all 0.2s ease'
                                }}
                              >
                                {tab === 'secrets' && `🔒 Secrets (${secretsList.length})`}
                                {tab === 'endpoints' && `🎯 Routes (${endpointsList.length})`}
                                {tab === 'vulns' && `⚠️ Vulns (${vulnsList.length})`}
                                {tab === 'code' && `📄 Code`}
                              </button>
                            ))}
                          </div>

                          {/* Tab Content 1: Leaked Secrets Indicator */}
                          {jsTab === 'secrets' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                              {secretsList.length === 0 ? (
                                <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border-primary)', borderRadius: 6 }}>
                                  🛡️ No credentials or sensitive API tokens discovered inside this script.
                                </div>
                              ) : (
                                secretsList.map((sec, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      background: 'rgba(255, 51, 102, 0.04)',
                                      border: '1px solid rgba(255, 51, 102, 0.2)',
                                      borderRadius: 6,
                                      padding: 10,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#ff3366', textTransform: 'uppercase' }}>
                                        ⚠️ {sec.label}
                                      </span>
                                      <button
                                        onClick={() => handleCopy(sec.value)}
                                        className="tool-copy-trigger"
                                        style={{ fontSize: 9.5, padding: '2px 6px' }}
                                      >
                                        Copy Secret
                                      </button>
                                    </div>
                                    <pre style={{
                                      margin: 0,
                                      padding: 8,
                                      background: 'var(--bg-primary)',
                                      border: '1px solid rgba(255, 51, 102, 0.1)',
                                      borderRadius: 4,
                                      color: '#e2e8f0',
                                      fontSize: 12,
                                      fontFamily: 'monospace',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all'
                                    }}>
                                      {sec.value}
                                    </pre>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* Tab Content 2: Extracted API Paths */}
                          {jsTab === 'endpoints' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                              {endpointsList.length === 0 ? (
                                <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border-primary)', borderRadius: 6 }}>
                                  🎯 No URL paths or routing endpoints extracted inside this script.
                                </div>
                              ) : (
                                endpointsList.map((end, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      background: 'var(--bg-secondary)',
                                      border: '1px solid var(--border-primary)',
                                      borderRadius: 6,
                                      padding: '10px 12px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: 12
                                    }}
                                  >
                                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--accent-cyan)', wordBreak: 'break-all' }}>
                                      {end.path}
                                    </span>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button
                                        onClick={() => {
                                          window.dispatchEvent(new CustomEvent('repeater-import-url', { detail: { url: end.path } }));
                                          alert('Endpoint path sent to Repeater!');
                                        }}
                                        className="tool-btn-primary"
                                        style={{ fontSize: 9.5, padding: '4px 8px', borderRadius: 3 }}
                                      >
                                        🚀 Repeater
                                      </button>
                                      <button
                                        onClick={() => handleCopy(end.path)}
                                        className="tool-copy-trigger"
                                        style={{ fontSize: 9.5, padding: '4px 8px', borderRadius: 3 }}
                                      >
                                        Copy
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* Tab Content 3: Dangerous Functions Audits */}
                          {jsTab === 'vulns' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }}>
                              {vulnsList.length === 0 ? (
                                <div style={{ padding: '30px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, border: '1px dashed var(--border-primary)', borderRadius: 6 }}>
                                  🛡️ Excellent! No occurrences of high-risk eval(), innerHTML, or dynamic timer triggers found.
                                </div>
                              ) : (
                                vulnsList.map((vuln, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      background: 'rgba(255, 184, 0, 0.04)',
                                      border: '1px solid rgba(255, 184, 0, 0.2)',
                                      borderRadius: 6,
                                      padding: 10,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4
                                    }}
                                  >
                                    <span style={{ fontSize: 12, fontWeight: 800, color: '#ffb800' }}>
                                      ⚠️ {vuln.label}
                                    </span>
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                                      {vuln.desc}
                                    </p>
                                    <pre style={{
                                      margin: '4px 0 0 0',
                                      padding: 8,
                                      background: 'var(--bg-primary)',
                                      border: '1px solid rgba(255, 184, 0, 0.1)',
                                      borderRadius: 4,
                                      color: '#ffb800',
                                      fontSize: 11.5,
                                      fontFamily: 'monospace',
                                      overflowX: 'auto',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all'
                                    }}>
                                      {vuln.codeSnippet}
                                    </pre>
                                  </div>
                                ))
                              )}
                            </div>
                          )}

                          {/* Tab Content 4: Beautified Code Box */}
                          {jsTab === 'code' && (
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                              <pre style={{
                                margin: 0,
                                padding: 12,
                                background: 'var(--bg-primary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: 6,
                                color: '#e2e8f0',
                                fontSize: 11.5,
                                fontFamily: 'monospace',
                                overflow: 'auto',
                                flex: 1,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all'
                              }}>
                                {activeCode}
                              </pre>
                            </div>
                          )}

                        </div>
                      )}

                    </div>

                  </div>
                </div>
              );
            })()}

          </div>
        </div>
      )}

    </div>
  );
}
