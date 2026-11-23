/*
 * MD Reader — popup controller.
 * Collects Markdown from paste, file, URL or the active tab, then opens the reader.
 */
(function () {
  'use strict';

  var UMR = window.UMR;
  var $ = function (id) { return document.getElementById(id); };
  var pendingFile = null;

  function setStatus(element, message, isError) {
    element.textContent = message || '';
    element.classList.toggle('error', !!isError);
    element.classList.toggle('ok', !!message && !isError);
  }

  function openReader(markdown, source, title, origin) {
    if (typeof markdown !== 'string' || !markdown.trim()) {
      setStatus($('globalStatus'), 'There is no Markdown to render.', true);
      return;
    }
    setStatus($('globalStatus'), 'Opening reader…');
    try {
      chrome.runtime.sendMessage({
        type: 'open-reader',
        markdown: markdown,
        source: source,
        title: title || UMR.titleFromMarkdown(markdown, 'Document'),
        origin: origin || ''
      }, function (response) {
        if (chrome.runtime.lastError) {
          setStatus($('globalStatus'), 'Could not open reader: ' + chrome.runtime.lastError.message, true);
          return;
        }
        if (response && response.ok) {
          window.close();
        } else {
          setStatus($('globalStatus'), 'Could not open the reader.', true);
        }
      });
    } catch (error) {
      setStatus($('globalStatus'), 'Could not open reader: ' + error.message, true);
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* Tabs */
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (other) {
        other.classList.toggle('active', other === tab);
      });
      Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (panel) {
        panel.classList.toggle('active', panel.id === 'panel-' + tab.getAttribute('data-tab'));
      });
      setStatus($('globalStatus'), '');
    });
  });

  $('openReaderBtn').addEventListener('click', function () {
    chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') });
    window.close();
  });

  /* Paste */
  $('pasteRender').addEventListener('click', function () {
    var text = $('pasteInput').value;
    openReader(text, 'paste', UMR.titleFromMarkdown(text, 'Pasted Markdown'));
  });

  $('pasteInput').addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      $('pasteRender').click();
    }
  });

  /* File */
  function acceptFile(file) {
    if (!file) return;
    pendingFile = file;
    $('fileName').textContent = file.name + ' · ' + formatBytes(file.size);
    $('fileRender').disabled = false;
    setStatus($('globalStatus'), '');
  }

  $('fileInput').addEventListener('change', function (event) {
    acceptFile(event.target.files && event.target.files[0]);
  });

  var dropzone = $('dropzone');
  dropzone.addEventListener('click', function () { $('fileInput').click(); });
  dropzone.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      $('fileInput').click();
    }
  });
  ['dragenter', 'dragover'].forEach(function (type) {
    dropzone.addEventListener(type, function (event) {
      event.preventDefault();
      dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropzone.addEventListener(type, function (event) {
      event.preventDefault();
      dropzone.classList.remove('dragging');
    });
  });
  dropzone.addEventListener('drop', function (event) {
    acceptFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
  });

  $('fileRender').addEventListener('click', function () {
    if (!pendingFile) return;
    setStatus($('globalStatus'), 'Reading file…');
    pendingFile.text().then(function (text) {
      openReader(text, 'file', UMR.titleFromMarkdown(text, pendingFile.name), 'local file');
    }).catch(function (error) {
      setStatus($('globalStatus'), 'Could not read file: ' + error.message, true);
    });
  });

  /* URL */
  function renderUrl() {
    var url = $('urlInput').value.trim();
    if (!/^https?:\/\//i.test(url)) {
      setStatus($('urlStatus'), 'Enter a full http:// or https:// URL.', true);
      return;
    }
    setStatus($('urlStatus'), 'Fetching…');
    chrome.runtime.sendMessage({ type: 'fetch-url', url: url }, function (response) {
      if (chrome.runtime.lastError) {
        setStatus($('urlStatus'), 'Fetch failed: ' + chrome.runtime.lastError.message, true);
        return;
      }
      if (!response || !response.ok) {
        setStatus($('urlStatus'), 'Could not fetch: ' + ((response && response.error) || 'unknown error'), true);
        return;
      }
      setStatus($('urlStatus'), '');
      openReader(response.text, 'url', UMR.titleFromMarkdown(response.text, response.url || url), url);
    });
  }

  $('urlRender').addEventListener('click', renderUrl);
  $('urlInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      renderUrl();
    }
  });

  /* Active tab */
  function readDom(tab) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: function () { return document.body ? document.body.innerText : ''; }
    }, function (results) {
      if (chrome.runtime.lastError) {
        setStatus($('tabStatus'), 'Cannot read this tab. For local files, enable "Allow access to file URLs" for MD Reader.', true);
        return;
      }
      var text = results && results[0] && results[0].result;
      if (typeof text !== 'string' || !text.trim()) {
        setStatus($('tabStatus'), 'No readable text found on this tab.', true);
        return;
      }
      openReader(text, 'tab', UMR.titleFromMarkdown(text, tab.title || 'Current tab'), tab.url || '');
    });
  }

  $('tabRender').addEventListener('click', function () {
    setStatus($('tabStatus'), 'Reading current tab…');
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (chrome.runtime.lastError) {
        setStatus($('tabStatus'), 'Cannot inspect tabs: ' + chrome.runtime.lastError.message, true);
        return;
      }
      var tab = tabs && tabs[0];
      if (!tab) {
        setStatus($('tabStatus'), 'No active tab found.', true);
        return;
      }

      var key = UMR.TAB_PREFIX + tab.id;
      chrome.storage.local.get(key, function (data) {
        var saved = data[key];
        if (saved && typeof saved.text === 'string' && saved.text.trim()) {
          openReader(saved.text, 'tab', UMR.titleFromMarkdown(saved.text, tab.title || 'Current tab'), tab.url || '');
          return;
        }

        if (/^file:/i.test(tab.url || '')) {
          readDom(tab);
          return;
        }

        chrome.runtime.sendMessage({ type: 'fetch-url', url: tab.url }, function (response) {
          if (chrome.runtime.lastError || !response || !response.ok) {
            readDom(tab);
            return;
          }
          openReader(response.text, 'tab', UMR.titleFromMarkdown(response.text, tab.title || 'Current tab'), tab.url || '');
        });
      });
    });
  });

  /* File-access awareness */
  chrome.runtime.sendMessage({ type: 'file-access' }, function (response) {
    if (chrome.runtime.lastError || !response || response.allowed !== false) return;
    $('fileHint').hidden = false;
    $('fileAccessLink').addEventListener('click', function (event) {
      event.preventDefault();
      chrome.tabs.create({ url: 'chrome://extensions/?id=' + chrome.runtime.id });
    });
  });
})();
