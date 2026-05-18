import type { CapturedRequest } from './types';

function escapeString(str: string): string {
  return str.replace(/'/g, "'\\''");
}

export function exportToCurl(req: CapturedRequest): string {
  let curl = `curl -X '${req.method}' \\\n  '${req.url}'`;

  if (req.requestHeaders) {
    for (const [key, value] of Object.entries(req.requestHeaders)) {
      if (key.toLowerCase() !== 'content-length') {
        curl += ` \\\n  -H '${key}: ${escapeString(String(value))}'`;
      }
    }
  }

  if (req.requestBody) {
    curl += ` \\\n  -d '${escapeString(req.requestBody)}'`;
  }

  return curl;
}

export function exportToPython(req: CapturedRequest): string {
  let py = `import requests\n\n`;
  py += `url = "${req.url}"\n`;
  
  if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) {
    py += `headers = {\n`;
    for (const [key, value] of Object.entries(req.requestHeaders)) {
      if (key.toLowerCase() !== 'content-length') {
        py += `    "${key}": "${String(value).replace(/"/g, '\\"')}",\n`;
      }
    }
    py += `}\n`;
  }

  if (req.requestBody) {
    py += `\ndata = """${req.requestBody}"""\n`;
  }

  py += `\nresponse = requests.request(\n    "${req.method}",\n    url,`;
  if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) py += `\n    headers=headers,`;
  if (req.requestBody) py += `\n    data=data`;
  py += `\n)\n\nprint(response.text)`;

  return py;
}

export function exportToFetch(req: CapturedRequest): string {
  let fetchCode = `fetch("${req.url}", {\n`;
  fetchCode += `  method: "${req.method}",\n`;
  
  if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) {
    fetchCode += `  headers: {\n`;
    for (const [key, value] of Object.entries(req.requestHeaders)) {
      if (key.toLowerCase() !== 'content-length') {
        fetchCode += `    "${key}": "${String(value).replace(/"/g, '\\"')}",\n`;
      }
    }
    fetchCode += `  },\n`;
  }

  if (req.requestBody) {
    fetchCode += `  body: JSON.stringify(${JSON.stringify(req.requestBody)}),\n`;
  }

  fetchCode += `})\n.then(response => response.text())\n.then(result => console.log(result))\n.catch(error => console.log('error', error));`;

  return fetchCode;
}
