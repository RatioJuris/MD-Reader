/*
 * MD Reader — in-page renderer.
 * Replaces a browser-displayed .md text document with a readable article.
 */
(function () {
  'use strict';

  if (!window.UMR) return;
  if (document.documentElement.getAttribute('data-mdreader-rendered') === '1') return;

  var pageUrl = location.href;
  if (pageUrl.indexOf(chrome.runtime.getURL('reader/')) === 0) return;

  var contentType = document.contentType || '';
  var isMarkdownPath = UMR.looksLikeMarkdownUrl(pageUrl);
  var isTextDocument = /text\/(?:plain|markdown|x-markdown)/i.test(contentType);
  if (!isMarkdownPath && !isTextDocument) return;

  var pre = document.querySelector('body > pre') || document.querySelector('pre');
  var source = pre ? pre.textContent : (document.body ? document.body.innerText : '');
  if (typeof source !== 'string' || !source.trim()) return;

  document.documentElement.setAttribute('data-mdreader-rendered', '1');
  chrome.runtime.sendMessage({ type: 'save-tab-source', text: source, url: pageUrl }, function () {
    if (chrome.runtime.lastError) { /* tab may be closing; harmless */ }
  });

  var stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('content.css');
  (document.head || document.documentElement).appendChild(stylesheet);

  var title = UMR.titleFromMarkdown(source, document.title || 'Document');
  document.title = title;

  var wrap = document.createElement('div');
  wrap.className = 'mdreader-root';
  wrap.innerHTML =
    '<div class="mdreader-bar">' +
      '<span class="mdreader-brand">MD <strong>Reader</strong></span>' +
      '<span class="mdreader-meta">' + UMR.escapeHtml(title) + '</span>' +
      '<span class="mdreader-spacer"></span>' +
      '<button type="button" data-mdreader-action="open">Reader view</button>' +
      '<button type="button" data-mdreader-action="copy">Copy Markdown</button>' +
      '<button type="button" data-mdreader-action="theme">Theme</button>' +
    '</div>' +
    '<article class="markdown-body mdreader-article">' + UMR.render(source) + '</article>';

  document.body.replaceChildren(wrap);
  UMR.enhanceCode(wrap);

  var themeOrder = ['auto', 'light', 'dark'];
  chrome.storage.local.get(UMR.THEME_KEY, function (data) {
    applyTheme(data[UMR.THEME_KEY] || 'auto');
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-mdreader-theme', UMR.effectiveTheme(theme));
  }

  wrap.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-mdreader-action]');
    if (!button) return;
    var action = button.getAttribute('data-mdreader-action');

    if (action === 'open') {
      chrome.runtime.sendMessage({
        type: 'open-reader',
        markdown: source,
        source: 'in-page',
        title: title,
        origin: pageUrl
      });
      return;
    }

    if (action === 'copy') {
      UMR.copyText(source);
      var label = button.textContent;
      button.textContent = 'Copied';
      setTimeout(function () { button.textContent = label; }, 1400);
      return;
    }

    if (action === 'theme') {
      chrome.storage.local.get(UMR.THEME_KEY, function (data) {
        var current = data[UMR.THEME_KEY] || 'auto';
        var next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
        chrome.storage.local.set({ [UMR.THEME_KEY]: next }, function () {
          applyTheme(next);
          button.textContent = 'Theme: ' + next;
        });
      });
    }
  });
})();
