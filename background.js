/*
 * MD Reader — service worker.
 * Handles URL fetching, saving the reader draft, and context-menu actions.
 */
'use strict';

importScripts('shared.js');

function openReader(draft) {
  return new Promise(function (resolve) {
    var payload = Object.assign({}, draft, { savedAt: Date.now() });
    var record = {};
    record[UMR.DRAFT_KEY] = payload;
    chrome.storage.local.set(record, function () {
      chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }, function (tab) {
        resolve(tab);
      });
    });
  });
}

async function fetchUrl(url) {
  try {
    var parsed = new URL(String(url));
    if (!/^https?:$/.test(parsed.protocol)) {
      return {
        ok: false,
        error: 'Only http and https links can be fetched in the background. For a local file, use the File tab in the popup.'
      };
    }

    var response = await fetch(parsed.href, { redirect: 'follow', credentials: 'omit' });
    if (!response.ok) {
      return { ok: false, error: 'Server returned HTTP ' + response.status + ' ' + (response.statusText || '') };
    }

    var contentType = response.headers.get('content-type') || '';
    var text = await response.text();
    if (/html/i.test(contentType) || /^\s*(?:<!doctype|<html)/i.test(text)) {
      text = UMR.extractFromHtml(text);
    }
    return { ok: true, text: text, contentType: contentType, url: response.url || parsed.href };
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) };
  }
}

function openFileHint(url, title) {
  return openReader({
    markdown: '',
    source: 'file',
    title: title || 'Local file',
    origin: url || '',
    hint: 'Background scripts cannot read local files. Use the File tab in the MD Reader popup, or enable "Allow access to file URLs" on the extension details page and reload the file.'
  });
}

function buildMenus() {
  try {
    chrome.contextMenus.removeAll(function () {
      chrome.contextMenus.create({
        id: 'mdreader-selection',
        title: 'Read selection in MD Reader',
        contexts: ['selection']
      });
      chrome.contextMenus.create({
        id: 'mdreader-link',
        title: 'Open link in MD Reader',
        contexts: ['link']
      });
      chrome.contextMenus.create({
        id: 'mdreader-page',
        title: 'Read this page in MD Reader',
        contexts: ['page']
      });
    });
  } catch (error) {
    /* context menus are optional */
  }
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'fetch-url':
      fetchUrl(message.url).then(sendResponse);
      return true;

    case 'open-reader':
      openReader({
        markdown: message.markdown,
        source: message.source || 'popup',
        title: message.title || '',
        origin: message.origin || '',
        hint: message.hint || ''
      }).then(function () { sendResponse({ ok: true }); });
      return true;

    case 'save-tab-source':
      if (sender.tab && typeof sender.tab.id === 'number') {
        var record = {};
        record[UMR.TAB_PREFIX + sender.tab.id] = {
          text: message.text,
          url: message.url,
          savedAt: Date.now()
        };
        chrome.storage.local.set(record);
      }
      sendResponse({ ok: true });
      return true;

    case 'file-access':
      sendResponse({
        allowed: chrome.extension.isAllowedFileSchemeAccess
          ? chrome.extension.isAllowedFileSchemeAccess()
          : true
      });
      return true;

    default:
      return;
  }
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId === 'mdreader-selection') {
    var selected = info.selectionText || '';
    openReader({
      markdown: selected,
      source: 'selection',
      title: UMR.titleFromMarkdown(selected, 'Selected text'),
      origin: info.pageUrl || ''
    });
    return;
  }

  if (info.menuItemId === 'mdreader-link') {
    var link = info.linkUrl || '';
    if (/^file:/i.test(link)) {
      openFileHint(link, 'Local link');
      return;
    }
    fetchUrl(link).then(function (result) {
      if (result.ok) {
        openReader({
          markdown: result.text,
          source: 'link',
          title: UMR.titleFromMarkdown(result.text, link),
          origin: link
        });
      } else {
        openReader({
          markdown: '',
          source: 'link',
          title: 'Link',
          origin: link,
          hint: 'Could not load that link: ' + result.error
        });
      }
    });
    return;
  }

  if (info.menuItemId === 'mdreader-page') {
    var page = info.pageUrl || '';
    if (/^file:/i.test(page)) {
      openFileHint(page, 'Local page');
      return;
    }
    fetchUrl(page).then(function (result) {
      if (result.ok) {
        openReader({
          markdown: result.text,
          source: 'page',
          title: UMR.titleFromMarkdown(result.text, page),
          origin: page
        });
      } else {
        openReader({
          markdown: '',
          source: 'page',
          title: 'Page',
          origin: page,
          hint: 'Could not load that page: ' + result.error
        });
      }
    });
  }
});
