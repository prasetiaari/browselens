import type { CapturedRequest } from './types';

export function runPassiveScan(req: CapturedRequest): string[] {
  const vulns: string[] = [];

  // 1. Check CORS Misconfiguration
  if (req.responseHeaders) {
    const corsOrigin = getHeaderValue(req.responseHeaders, 'Access-Control-Allow-Origin');
    const corsCreds = getHeaderValue(req.responseHeaders, 'Access-Control-Allow-Credentials');
    
    if (corsOrigin === '*') {
      vulns.push('CORS: Wildcard origin detected (Access-Control-Allow-Origin: *)');
      if (corsCreds === 'true') {
        vulns.push('CORS: Wildcard origin with credentials allowed');
      }
    }
  }

  // 2. Check Cookie Security
  if (req.responseHeaders) {
    const setCookie = getHeaderValue(req.responseHeaders, 'Set-Cookie');
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const cookie of cookies) {
        if (!cookie) continue;
        const cLower = String(cookie).toLowerCase();
        if (!cLower.includes('httponly')) {
          vulns.push('Cookie: Missing HttpOnly flag');
        }
        if (!cLower.includes('secure')) {
          vulns.push('Cookie: Missing Secure flag');
        }
        if (!cLower.includes('samesite')) {
          vulns.push('Cookie: Missing SameSite attribute');
        }
      }
    }
  }

  // 3. Check Missing Security Headers (only for HTML responses)
  const contentType = req.responseHeaders ? getHeaderValue(req.responseHeaders, 'Content-Type') : '';
  const isHtml = contentType && String(contentType).toLowerCase().includes('text/html');

  if (isHtml && req.responseHeaders) {
    const csp = getHeaderValue(req.responseHeaders, 'Content-Security-Policy');
    const hsts = getHeaderValue(req.responseHeaders, 'Strict-Transport-Security');
    const xfo = getHeaderValue(req.responseHeaders, 'X-Frame-Options');
    const xcto = getHeaderValue(req.responseHeaders, 'X-Content-Type-Options');

    if (!csp) {
      vulns.push('Header: Missing Content-Security-Policy (CSP)');
    }
    if (!hsts) {
      vulns.push('Header: Missing Strict-Transport-Security (HSTS)');
    }
    if (!xfo) {
      vulns.push('Header: Missing X-Frame-Options (Clickjacking risk)');
    }
    if (!xcto) {
      vulns.push('Header: Missing X-Content-Type-Options (MIME Sniffing risk)');
    }
  }

  // 4. Sensitive Data in URLs/Params
  const sensitiveRegex = /(password|passwd|api_key|apikey|secret|token|session_id|auth_token|private_key)/i;
  
  if (req.url && sensitiveRegex.test(req.url)) {
    vulns.push('Sensitive Data: Potential credentials or session token found in URL parameters');
  }

  // 5. Information Leakage (e.g. server headers)
  if (req.responseHeaders) {
    const serverHeader = getHeaderValue(req.responseHeaders, 'Server');
    if (serverHeader && /\d/.test(serverHeader)) { // if server contains version numbers
      vulns.push(`Info Leakage: Server version header exposed (${serverHeader})`);
    }
    const xPoweredBy = getHeaderValue(req.responseHeaders, 'X-Powered-By');
    if (xPoweredBy) {
      vulns.push(`Info Leakage: Technology stack exposed via X-Powered-By header (${xPoweredBy})`);
    }
  }

  // 5b. Database Error Leak Checker (Passive Scan Point 5)
  if (req.responseBody && isHtml) {
    const dbErrors = [
      { name: 'MySQL', regex: /(SQL syntax.*?mysql|warning.*?mysql_.*?|valid MySQL result|MySqlException)/i },
      { name: 'PostgreSQL', regex: /(PostgreSQL.*?ERROR|Warning.*?pg_.*?|PostgreSQL query failed|Severity: ERROR.*?fields:)/i },
      { name: 'Oracle', regex: /(Oracle error|ORA-\d{5}|OracleException|TNS-.*?)/i },
      { name: 'SQLite', regex: /(SQLite\/JDBCDriver|SQLiteException|System\.Data\.SQLite\.SQLiteException)/i },
      { name: 'Microsoft SQL Server', regex: /(Driver.*?SQL Server|SQLServerException|Warning.*?mssql_.*?|SqlException)/i },
      { name: 'MongoDB', regex: /(MongoException|MongoServerException|MongoDB\.Driver|WriteError.*?code.*?writeConcernError)/i },
      { name: 'Generic SQL / PHP Stacktrace', regex: /(SQL syntax|Fatal error.*?in.*?on line|Call to undefined function|Stack trace:)/i }
    ];

    for (const db of dbErrors) {
      if (db.regex.test(req.responseBody)) {
        vulns.push(`DB Leak: Exposed ${db.name} database error or stacktrace found in response body!`);
      }
    }
  }

  // 5c. Leaked Secrets Scan on Response Body (Passive Scan Point 5)
  if (req.responseBody && !req.responseBody.startsWith('[Response body discarded')) {
    const secretPatterns = [
      { name: 'AWS Access Key', regex: /(A3T[A-Z0-9]|AKIA[A-Z0-9]{12,})/ },
      { name: 'Google API Key', regex: /AIza[Sy][A-Za-z0-9_-]{35}/ },
      { name: 'Slack Token', regex: /xox[bapr]-[0-9]{10,12}-[A-Za-z0-9]{24}/ },
      { name: 'Stripe API Key', regex: /sk_live_[0-9a-zA-Z]{24}/ },
      { name: 'Generic API/Secret Key', regex: /(?:key|api|secret|password|token|auth|pass|cred)(?:["']?\s*[:=]\s*["'])([A-Za-z0-9_-]{16,})(?:["'])/i }
    ];

    for (const pattern of secretPatterns) {
      const match = pattern.regex.exec(req.responseBody);
      if (match) {
        // Exclude false positives (like common strings or styling tags)
        const val = match[1] || match[0];
        if (val.length < 50 || !val.includes(' ') && !val.includes('<') && !val.includes('>')) {
          vulns.push(`Secret Leak: Potential ${pattern.name} found in response body (${val.substring(0, 10)}...)!`);
        }
      }
    }
  }

  // 6. Reflected XSS / Input Reflection (Simple Grading)
  if (req.responseBody && req.url && isHtml) {
    try {
      const urlObj = new URL(req.url);
      const params = urlObj.searchParams;

      const checkReflection = (value: string, key: string, source: 'URL' | 'POST') => {
        if (!value || value.length < 3) return; // ignore extremely short values
        
        if (req.responseBody!.includes(value)) {
          const hasHtmlTags = /[<>]/.test(value);
          const hasSpecialChars = /["';()]/.test(value);

          if (hasHtmlTags) {
            vulns.push(`Reflected XSS [🔴 Score 9 - HIGH]: ${source} parameter "${key}" value containing raw HTML (${value}) is reflected in response!`);
          } else if (hasSpecialChars) {
            vulns.push(`Reflection [🟡 Score 5 - MEDIUM]: ${source} parameter "${key}" value containing unescaped special characters (${value}) is reflected in response!`);
          } else {
            vulns.push(`Reflection [🟢 Score 2 - INFO]: ${source} parameter "${key}" value (${value}) is reflected in response.`);
          }
        }
      };

      // Check URL params
      params.forEach((value, key) => {
        checkReflection(value, key, 'URL');
      });

      // Check POST Body params
      if (req.requestBody && req.method === 'POST') {
        let postParams: Record<string, any> = {};
        if (req.requestBody.startsWith('{')) {
          try {
            postParams = JSON.parse(req.requestBody);
          } catch (_) {}
        } else {
          const searchParams = new URLSearchParams(req.requestBody);
          searchParams.forEach((val, k) => {
            postParams[k] = val;
          });
        }

        const traversePostParams = (val: any, k: string) => {
          if (typeof val === 'string') {
            checkReflection(val, k, 'POST');
          } else if (typeof val === 'object' && val !== null) {
            Object.entries(val).forEach(([subK, subV]) => traversePostParams(subV, `${k}.${subK}`));
          }
        };

        Object.entries(postParams).forEach(([k, v]) => traversePostParams(v, k));
      }
    } catch (_) {}
  }

  // Deduplicate findings
  return Array.from(new Set(vulns));
}

function getHeaderValue(headers: Record<string, string> | undefined | null, name: string): string {
  if (!headers || typeof headers !== 'object') return '';
  const target = (name || '').toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key && typeof key === 'string' && key.toLowerCase() === target) {
      return String(value);
    }
  }
  return '';
}
