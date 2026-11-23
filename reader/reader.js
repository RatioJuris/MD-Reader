/*
 * MD Reader — reader page controller.
 * Renders the saved draft and provides outline, themes, copy and print controls.
 */
(function () {
  'use strict';

  var UMR = window.UMR;
  var $ = function (id) { return document.getElementById(id); };
  var themeOrder = ['auto', 'light', 'dark'];
  var currentMarkdown = '';

  function sourceLabel(draft) {
    var names = {
      paste: 'Pasted text',
      file: 'Local file',
      url: 'Web link',
      link: 'Web link',
      tab: 'Current tab',
      page: 'Web page',
      selection: 'Selected text',
      'in-page': 'Opened file'
    };
    var label = names[draft.source] || 'Markdown document';
    if (draft.origin) {
      try {
        var parsed = new URL(draft.origin);
        label += ' · ' + (parsed.hostname + parsed.pathname).slice(0, 80);
      } catch (error) {
        label += ' · ' + String(draft.origin).slice(0, 80);
      }
    }
    return label;
  }

  function flash(button, label) {
    var original = button.textContent;
    button.textContent = label;
    setTimeout(function () { button.textContent = original; }, 1400);
  }

  function buildToc() {
    var list = $('tocList');
    list.innerHTML = '';

    var headings = $('content').querySelectorAll('h2, h3, h4, h5, h6');
    if (!headings.length) {
      $('toc').hidden = true;
      return;
    }
    $('toc').hidden = false;

    Array.prototype.forEach.call(headings, function (heading) {
      if (!heading.id) heading.id = UMR.slug(heading.textContent);
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent.replace(/[#*`~]/g, '');
      link.className = 'toc-' + heading.tagName.toLowerCase();
      link.setAttribute('data-target', heading.id);
      list.appendChild(link);
    });

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          Array.prototype.forEach.call(list.querySelectorAll('a'), function (link) {
            link.classList.toggle('active', link.getAttribute('data-target') === entry.target.id);
          });
        });
      }, { rootMargin: '-70px 0px -75% 0px', threshold: 0 });
      Array.prototype.forEach.call(headings, function (heading) { observer.observe(heading); });
    }
  }

  function showWelcome(hint) {
    currentMarkdown = '';
    $('content').innerHTML =
      '<div class="reader-welcome">' +
        '<h1>MD Reader</h1>' +
        '<p>A quiet place to read Markdown. Raw syntax becomes an ordinary document — headings, tables, links and code, without the markup.</p>' +
        (hint ? '<div class="reader-notice">' + UMR.escapeHtml(hint) + '</div>' : '') +
        '<h2>How to open a document</h2>' +
        '<ol>' +
          '<li>Click the MD Reader toolbar icon and paste text, choose a local file, enter a URL, or use the current tab.</li>' +
          '<li>Open a <code>.md</code> file directly in the browser — it renders in place when file access is enabled.</li>' +
          '<li>Right-click selected text or a link and choose <strong>Read in MD Reader</strong>.</li>' +
        '</ol>' +
        '<p>Theme, outline, copy and print controls are in the bar above.</p>' +
      '</div>';
    $('sourceLabel').textContent = 'Welcome';
    $('stats').textContent = '';
    $('toc').hidden = true;
    document.title = 'MD Reader';
    buildToc();
  }

  function showDraft(draft) {
    currentMarkdown = typeof draft.markdown === 'string' ? draft.markdown : '';
    if (!currentMarkdown.trim()) {
      showWelcome(draft.hint || 'No Markdown was supplied for this document.');
      return;
    }

    var title = draft.title || UMR.titleFromMarkdown(currentMarkdown, 'Untitled document');
    document.title = title;
    $('sourceLabel').textContent = sourceLabel(draft);
    $('content').innerHTML = UMR.render(currentMarkdown);
    UMR.enhanceCode($('content'));
    buildToc();

    var count = UMR.stats(currentMarkdown);
    $('stats').innerHTML =
      '<span>' + count.words.toLocaleString() + ' words</span>' +
      '<span>' + count.characters.toLocaleString() + ' characters</span>' +
      '<span>' + count.minutes + ' min read</span>';
  }

  function applyTheme(theme, persist) {
    document.body.setAttribute('data-theme', UMR.effectiveTheme(theme));
    $('themeBtn').textContent = 'Theme: ' + theme;
    if (persist !== false) {
      chrome.storage.local.set({ [UMR.THEME_KEY]: theme });
    }
  }

  function load() {
    chrome.storage.local.get([UMR.DRAFT_KEY, UMR.THEME_KEY], function (data) {
      applyTheme(data[UMR.THEME_KEY] || 'auto', false);
      var draft = data[UMR.DRAFT_KEY];
      if (draft && typeof draft === 'object') showDraft(draft);
      else showWelcome();
    });
  }

  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var percent = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
    $('progressBar').style.width = percent + '%';
  }

  $('themeBtn').addEventListener('click', function () {
    var current = $('themeBtn').textContent.replace('Theme: ', '').trim();
    var next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
    applyTheme(next);
  });

  $('tocBtn').addEventListener('click', function () {
    $('toc').hidden = !$('toc').hidden;
  });

  $('copyHtmlBtn').addEventListener('click', function () {
    UMR.copyText($('content').innerHTML);
    flash(this, 'Copied HTML');
  });

  $('copyMdBtn').addEventListener('click', function () {
    UMR.copyText(currentMarkdown);
    flash(this, 'Copied MD');
  });

  $('printBtn').addEventListener('click', function () {
    window.print();
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  load();
  onScroll();
})();
