import beautify from 'js-beautify';

/**
 * Automatically format/prettify a string based on its content or content-type.
 * Supports JSON, JavaScript, HTML, and CSS.
 */
export function formatContent(content?: string, contentType?: string): string {
  if (!content) return '';
  const cleanContent = content.trim();
  if (!cleanContent) return '';

  const ct = (contentType || '').toLowerCase();
  const isJsonLike = cleanContent.startsWith('{') || cleanContent.startsWith('[');
  const isHtmlLike = cleanContent.startsWith('<');

  // 1. Explicit or Guessed JSON
  if (ct.includes('json') || (!ct && isJsonLike)) {
    try {
      const parsed = JSON.parse(cleanContent);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // If JSON.parse fails, it might be a JS object literal or malformed JSON.
      // Fallback to JS beautifier.
      try {
        return beautify.js(cleanContent, { indent_size: 2 });
      } catch {
        return content;
      }
    }
  }

  // 2. Explicit or Guessed HTML/XML
  if (ct.includes('html') || ct.includes('xml') || (!ct && isHtmlLike)) {
    try {
      return beautify.html(cleanContent, { indent_size: 2 });
    } catch {
      return content;
    }
  }

  // 3. Explicit CSS
  if (ct.includes('css')) {
    try {
      return beautify.css(cleanContent, { indent_size: 2 });
    } catch {
      return content;
    }
  }

  // 4. Explicit JavaScript
  if (ct.includes('javascript') || ct.includes('ecmascript')) {
    try {
      return beautify.js(cleanContent, { indent_size: 2 });
    } catch {
      return content;
    }
  }

  // 5. Fallback: try JS beautifier just in case it's JS code without content-type
  try {
    const formatted = beautify.js(cleanContent, { indent_size: 2 });
    // If it didn't change much or fails, just return original
    return formatted;
  } catch {
    return content;
  }
}
