/*
 * MD Reader — shared helpers.
 * Loaded as a classic script in the service worker, popup, content script and reader page.
 * Everything is attached to globalThis.UMR so no bundler is needed.
 */
(function (root) {
  'use strict';

  var DRAFT_KEY = 'mdreader.draft';
  var THEME_KEY = 'mdreader.theme';
  var TAB_PREFIX = 'mdreader.tab.';
  var MD_EXT = /\.(md|markdown|mdown|mkd|mdtxt|mdtext)(?:[?#].*)?$/i;

  var ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    '#39': "'", '#x27': "'", '#x2f': '/'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeEntities(value) {
    return String(value == null ? '' : value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (whole, code) {
      code = String(code);
      var named = ENTITIES[code.toLowerCase()] || ENTITIES[code];
      if (named) return named;
      if (code.charAt(0) === '#') {
        var hex = code.charAt(1) === 'x' || code.charAt(1) === 'X';
        var number = parseInt(hex ? code.slice(2) : code.slice(1), hex ? 16 : 10);
        if (!isNaN(number) && number >= 0 && number <= 0x10ffff) {
          try { return String.fromCodePoint(number); } catch (e) { /* ignore */ }
        }
      }
      return whole;
    });
  }

  function looksLikeMarkdownUrl(url) {
    try {
      var parsed = new URL(String(url));
      if (!/^(file|http|https):$/.test(parsed.protocol)) return false;
      return MD_EXT.test(parsed.pathname) || /(?:^|\/)(raw|markdown|md)(?:\/|$)/i.test(parsed.pathname);
    } catch (e) {
      return false;
    }
  }

  function extractFromHtml(html) {
    var text = String(html || '');
    var pre = text.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
    if (pre && pre[1].length > 20) {
      return decodeEntities(pre[1].replace(/<[^>]+>/g, '')).trim();
    }
    var body = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (body) text = body[1];
    text = text
      .replace(/<\s*(script|style|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr|pre|blockquote|article|section)>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    return decodeEntities(text).replace(/\n{3,}/g, '\n\n').trim();
  }

  function titleFromMarkdown(markdown, fallback) {
    var lines = String(markdown || '').split(/\r?\n/);
    for (var i = 0; i < lines.length; i += 1) {
      var heading = lines[i].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (heading) {
        return heading[1].replace(/[*_`~\[\]]/g, '').trim();
      }
    }
    if (lines.length > 1 && /^\s*(?:=+|-+)\s*$/.test(lines[1]) && lines[0].trim()) {
      return lines[0].trim();
    }
    return fallback || 'Untitled document';
  }

  function stats(markdown) {
    var text = String(markdown || '');
    var words = (text.match(/[\u00C0-\uFFFF\w'-]+/g) || []).length;
    return {
      words: words,
      characters: text.length,
      minutes: Math.max(1, Math.ceil(words / 220))
    };
  }

  function slug(value) {
    var id = String(value || '')
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/[^\w\u00C0-\uFFFF\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return id || 'section';
  }

  var KEYWORDS = {
    _default: 'const let var function return if else for while class new import from export default async await try catch finally throw typeof instanceof this null undefined true false switch case break continue do in of yield public private static void int float string bool',
    py: 'def class return if elif else for while import from as with try except finally raise lambda None True False and or not in is pass yield async await global nonlocal self',
    sh: 'if then else elif fi for do done while case esac function return export local echo cd set source',
    css: 'color background background-color margin padding display position relative absolute fixed flex grid align-items justify-content border font-size font-family width height opacity transform transition',
    sql: 'select from where insert into values update set delete create table alter drop join left right inner outer on group by order having limit as distinct and or not null true false',
    html: 'div span a img p h1 h2 h3 h4 h5 h6 ul ol li table tr td th form input button section article header footer nav main class id href src'
  };

  function highlight(raw, language) {
    var lang = String(language || 'text').toLowerCase();
    var keywordText = KEYWORDS[lang] || KEYWORDS._default;
    var keywords = {};
    keywordText.split(/\s+/).forEach(function (word) { if (word) keywords[word] = true; });

    var hashComments = /^(py|python|sh|bash|shell|yaml|yml|ruby|rb|ini|toml|conf)$/.test(lang);
    var parts = [
      '"(?:\\\\.|[^"\\\\])*"',
      "'(?:\\\\.|[^'\\\\])*'",
      '`(?:\\\\.|[^`\\\\])*`',
      '\\/\\/[^\\n]*',
      '\\/\\*[\\s\\S]*?\\*\\/'
    ];
    if (hashComments) parts.push('#[^\\n]*');
    parts.push('@[A-Za-z-]+', '\\b\\d+(?:\\.\\d+)?\\b', '\\b[A-Za-z_$][\\w$]*\\b');

    var pattern = new RegExp('(' + parts.join('|') + ')', 'g');
    var output = '';
    var lastIndex = 0;
    var match;

    while ((match = pattern.exec(raw)) !== null) {
      output += escapeHtml(raw.slice(lastIndex, match.index));
      var token = match[0];
      var kind = '';
      if (/^["'`]/.test(token)) kind = 'str';
      else if (/^(\/\/|\/\*|#)/.test(token)) kind = 'com';
      else if (/^@/.test(token)) kind = 'kw';
      else if (/^\d/.test(token)) kind = 'num';
      else if (keywords[token]) kind = 'kw';
      output += kind
        ? '<span class="tok-' + kind + '">' + escapeHtml(token) + '</span>'
        : escapeHtml(token);
      lastIndex = match.index + token.length;
    }
    output += escapeHtml(raw.slice(lastIndex));
    return output;
  }

  function legacyCopy(text) {
    try {
      var area = root.document.createElement('textarea');
      area.value = String(text);
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      root.document.body.appendChild(area);
      area.select();
      root.document.execCommand('copy');
      root.document.body.removeChild(area);
    } catch (e) { /* clipboard unavailable */ }
  }

  function copyText(text) {
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        return root.navigator.clipboard.writeText(String(text)).catch(function () { legacyCopy(text); });
      }
    } catch (e) { /* fall through */ }
    legacyCopy(text);
    return Promise.resolve();
  }

  function configureMarked() {
    if (!root.marked || !root.marked.setOptions) return;
    try {
      root.marked.setOptions({ gfm: true, breaks: false, pedantic: false, headerIds: true, mangle: false });
    } catch (e) {
      try { root.marked.setOptions({ gfm: true, breaks: false }); } catch (e2) { /* use defaults */ }
    }
  }

  function render(markdown) {
    var source = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n');
    if (!root.marked || !root.marked.parse) {
      return '<pre>' + escapeHtml(source) + '</pre>';
    }
    configureMarked();
    var html = root.marked.parse(source);

    if (root.DOMPurify && root.DOMPurify.sanitize) {
      html = root.DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        ADD_TAGS: ['input'],
        ADD_ATTR: ['target', 'rel', 'id', 'class', 'checked', 'disabled', 'type'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'object', 'embed', 'link', 'meta'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style']
      });
    }

    html = html.replace(/<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi, function (whole, level, attrs, inner) {
      if (/\bid\s*=/.test(attrs)) return whole;
      var id = slug(inner.replace(/<[^>]+>/g, ''));
      return '<h' + level + attrs + ' id="' + id + '">' + inner + '</h' + level + '>';
    });

    if (root.document && root.document.createElement) {
      var template = root.document.createElement('template');
      template.innerHTML = html;
      Array.prototype.forEach.call(template.content.querySelectorAll('a[href]'), function (anchor) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      });
      html = template.innerHTML;
    }
    return html;
  }

  function enhanceCode(container) {
    if (!container || !container.querySelectorAll || !root.document) return;
    var blocks = container.querySelectorAll('pre > code');
    Array.prototype.forEach.call(blocks, function (code) {
      var pre = code.parentNode;
      if (pre.getAttribute('data-mdreader-code') === '1') return;
      pre.setAttribute('data-mdreader-code', '1');

      var languageMatch = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className || '');
      var language = languageMatch ? languageMatch[1] : 'text';
      var raw = code.textContent;
      code.innerHTML = highlight(raw, language);

      var button = root.document.createElement('button');
      button.type = 'button';
      button.className = 'md-code-copy';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');
      button.addEventListener('click', function () {
        copyText(raw);
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = 'Copy'; }, 1400);
      });
      pre.appendChild(button);
    });
  }

  function effectiveTheme(theme) {
    if (theme === 'auto') {
      var dark = false;
      try {
        dark = root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches;
      } catch (e) { /* ignore */ }
      return dark ? 'dark' : 'light';
    }
    return theme === 'dark' ? 'dark' : 'light';
  }

  root.UMR = {
    DRAFT_KEY: DRAFT_KEY,
    THEME_KEY: THEME_KEY,
    TAB_PREFIX: TAB_PREFIX,
    escapeHtml: escapeHtml,
    decodeEntities: decodeEntities,
    looksLikeMarkdownUrl: looksLikeMarkdownUrl,
    extractFromHtml: extractFromHtml,
    titleFromMarkdown: titleFromMarkdown,
    stats: stats,
    slug: slug,
    render: render,
    enhanceCode: enhanceCode,
    copyText: copyText,
    effectiveTheme: effectiveTheme
  };
})(globalThis);
