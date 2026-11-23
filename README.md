# MD Reader

MD Reader is a browser extension that turns raw Markdown into a clean, readable document. It works with local `.md` files, remote Markdown links, pasted text, the active tab, and right-click selections.

## Builds

The repository at <https://github.com/RatioJuris/MD-Reader> is the source of truth for builds.

- Pushes to `main` and pull requests produce a ZIP build artifact through GitHub Actions.
- Tags beginning with `v` attach the same ZIP to a GitHub Release.
- To build locally on Windows: `pwsh -File scripts/build.ps1`. The package is written to `build/`.

## Install (unpacked, Chromium)

1. Download and unzip a build from the repository's Actions or Releases, or use this source folder.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. Optional but recommended: open the extension's **Details** page and enable **Allow access to file URLs**. Without this, local `.md` files cannot be read by the extension; use the **File** tab in the popup instead.

## Use

- Click the toolbar icon. Choose **Paste**, **File**, **URL**, or **Tab**, then render.
- Open a `.md` file directly in the browser. With file access enabled it renders in place.
- Right-click selected text, a link, or a page and choose a **Read in MD Reader** action.

The reader view provides an outline, reading progress, light/dark/system themes, copy HTML, copy original Markdown, and print / save as PDF. Code blocks get lightweight syntax colouring and a copy button.

## What is supported

- GFM headings, lists, nested lists, task lists, tables, blockquotes, horizontal rules
- Fenced code blocks with basic highlighting for common languages
- Bold, italic, strikethrough, inline code, links, images
- Sanitised output — raw HTML in Markdown is stripped, not executed

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting` | Read the current tab's text when you choose **Tab** |
| `storage` | Remember the document being read and your theme choice |
| `contextMenus` | Add the right-click actions |
| `<all_urls>` host access | Fetch Markdown from arbitrary public URLs |
| `file:///*` | Allow rendering local Markdown files when you opt in |

## Layout

```
MD Reader/
├── manifest.json
├── background.js        # service worker: fetch, drafts, context menus
├── content.js           # in-place renderer for opened .md files
├── content.css          # typography and in-page styles
├── shared.js            # parser, sanitising, helpers
├── lib/                 # vendored marked + DOMPurify and their licences
├── popup/               # extension popup UI
└── reader/              # full reader page
```

## Limits

- The file-URL toggle is manual; Chrome does not let an extension grant it itself.
- Pages that require a login may not be fetchable unless the browser is already signed in and the request is permitted.
- HTML pages are reduced to readable text; this is not a general web page converter.
- Built-in browser PDF viewer and `chrome://` pages cannot be scripted by extensions.
- Safari support is not included in this prototype.

## Attribution

- [marked](https://github.com/markedjs/marked) — MIT License (see `lib/LICENSE-marked.txt`)
- [DOMPurify](https://github.com/cure53/DOMPurify) — MPL-2.0 / Apache-2.0 (see `lib/LICENSE-dompurify.txt`)
