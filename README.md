# Har Assist

**A visual HAR assistant for VS Code with automatic file opening, fast request filtering, resizable tables, and split request/response inspection.**

> **Independent project:** Har Assist is independently maintained by
> [ceendev](https://github.com/ceendev) and published by **yeceen**. It is based
> on the GPL-licensed [HAR Analyzer by Matt Foulks](https://github.com/mfoulks3200/har-analyzer)
> and is **not affiliated with, endorsed by, or published by Matt Foulks**.

<img src="resources/har-assist-icon.png" alt="Har Assist icon" width="128" height="128">

Open a `.har` file and Har Assist takes over automatically. The file opens as a
dedicated read-only network workspace instead of raw JSON, including large HAR
files that exceed VS Code's normal text-document size limit.

## Highlights

- Open `.har` files directly with a first-class VS Code custom editor.
- Filter by domain, application, protocol, method, content type, status, or text.
- Horizontally scroll complete request URLs in a resizable request table, with
  duration and status pinned to the right and the header fixed vertically.
- Keep the selected request URL in the top Inspector bar and drag horizontally
  to reveal long paths and query strings; hover the bar to reveal its copy
  button, with pointer-local success feedback.
- Open request and response details in a draggable split inspector.
- Inspect a Reqable-style overview with basic metadata and collapsible application,
  connection, timing and size groups. Preserve Reqable's microsecond timestamps,
  align resizable key/value columns, and distinguish unknown values from zero.
- Resize columns throughout the request list and inspector tables.
- Collapse either the request or response inspector while keeping one visible.
- View JSON, XML, HTML, JavaScript, CSS and plain text in read-only CodeMirror
  controls; JSON is automatically indented without changing number tokens or keys.
- Inspect the complete HTTP message in both Raw tabs, with exactly **文本** and
  **Hex** modes. Both include the start line, all headers, separator and body.
  Hex serializes the HAR header fields and appends decoded Base64 body bytes
  unchanged (or UTF-8 text when only text was saved).
- Switch request and response bodies to Hex with byte offsets, ASCII, byte search
  and selection/copy, including JSON, text, XML and HTML in standalone tabs.
  Hex uses decoded Base64 bytes directly, or the unchanged HAR text as UTF-8;
  JSON formatting and HTML preview never alter its content.
- Preview images with zoom/pan/rotate, and play captured audio/video when the
  content is complete and its codec is supported by VS Code.
- HTML Preview first shows a risk notice and a **开始真实预览** button. Only clicking
  this button enables captured scripts, live resources, links and forms; other
  requests and new tabs require their own confirmation. Relative resources resolve
  against the recorded request URL. The preview stays isolated from the VS Code
  host, and browser/site security policies still apply. HAR/source bytes stay unchanged.
- Double-click the fixed open-tab hint to use the same viewer in a separate tab.
- Parse HAR data directly in the WebView, with available memory as the practical
  file-size limit.

Filters within a quick-filter group use OR; different groups, domain, application,
and search filters use AND. **All** clears only the quick filters, while the search
clear button clears only the search text. Search is case-insensitive and covers
the complete captured request/response headers and bodies, not just the body
preview. **Starts with** and **Equals** match individual values in the selected
scope (for example a URL, header value, or body).

## Development

Use Node.js 22 or later:

```bash
npm ci
npm run check
npm run package
npm run check:package
```

The package command creates `har-assist.vsix`. Install it with VS Code's
**Extensions: Install from VSIX...** command.

GitHub Actions builds pushes and pull requests targeting `ceen` or `main`.
Pushing a new package version automatically creates its tag/Release and publishes
to Marketplace after source and VSIX tests succeed. See [Publishing](PUBLISHING.md).

## License and attribution

Har Assist is released under GPL-3.0 and retains the original project's license
and copyright notices. The current extension has a new identity, original icon,
automatic custom-editor integration, large-file loading, a redesigned filtering
toolbar, a split request/response inspector, and resizable tables.

The Har Assist icon was created specifically for this project without using the
upstream artwork as an input or reference. See
[Artwork provenance](ARTWORK-PROVENANCE.md).
