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
