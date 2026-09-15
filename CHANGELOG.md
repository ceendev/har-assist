# Changelog

All notable changes to Har Assist are documented here.

## 0.1.29

- Replace disabled HTML preview with a risk notice and “开始真实预览” button.
  No HTML frame or live resources are loaded until explicitly confirmed; each
  request, new tab and return to Preview requires a fresh confirmation.
- Allow scripts, external resources, links and forms in confirmed previews, and
  resolve relative resources against the recorded request URL in standalone tabs
  as well as the Inspector. Preserve page-owned policies and original HAR bytes.
- Keep active pages isolated from the VS Code host and ignore preview-originated
  messages that impersonate extension messages. Browser/site restrictions still apply.

## 0.1.28

- Rename the request Path tab to “路径” and move Parameters ahead of Request
  Headers, keeping each tab's contents and behavior unchanged.

## 0.1.27

- Add a Request Path tab between Raw and Request Headers, listing each URL path
  segment in a numbered, two-column table with independently resizable columns.
- Exclude the URL authority, query and fragment while preserving recorded path
  spelling, percent-encoding, dot segments and empty segments; refresh on selection.
- Render Inspector table cells as literal text, retaining Unicode characters such
  as emoji without interpreting captured values as HTML or changing HAR data.

## 0.1.26

- Theme text/code search inputs, buttons, checkboxes and panels with VS Code colors,
  removing CodeMirror's default light gradients and keeping controls readable in
  dark, light and high-contrast themes. Use compact Chinese search labels.
- Hide the Hex search toolbar by default; open it from the right-hand Find button
  or Ctrl/Cmd+F and close it with the close button or Escape, reclaiming its space.
- Retain Hex selection and keyboard copying while search is closed, and keep Find
  working after mode switches. Apply the shared fix to request/response bodies,
  Raw views and standalone tabs.

## 0.1.25

- Remove the extra blank space below collapsed request and response headers by
  overriding the expanded panel's minimum height only while collapsed.
- Preserve expanded panel sizing, splitter dragging and the one-open-panel rule.
- Color both response header badges by status class: blue for 1xx, green for 2xx,
  yellow for 3xx, orange for 4xx, red for 5xx, and neutral for zero/unknown status.
  Refresh the colors when selecting requests, including while collapsed.

## 0.1.24

- Redesign the request overview with Reqable-style basic information and collapsible
  application, connection, timing and size groups, with aligned resizable columns.
- Read Reqable's application/connection metadata and microsecond timestamps, and
  match its complete header/message size display without double-counting standard HAR.
- Fall back to standard HAR timing fields where available, without double-counting
  SSL; show unknown values as dashes and preserve real zero sizes and durations.
- Keep the full URL in the Inspector bar and retain the body and Raw viewers.

## 0.1.23

- Remove the Base64-only Hex restriction from request/response bodies and their
  standalone tabs. JSON, plain text, XML, HTML and other recorded text support Hex.
- Use the unformatted HAR text as UTF-8 when no decoded Base64 bytes are available,
  preserving whitespace, line endings, BOMs, escapes, duplicate keys and numbers.
- Retain direct Base64 byte decoding, image/media previews and complete-message
  Raw views, without adding encoding banners or changing the HAR source.

## 0.1.22

- Keep UTF-8 text readable in both complete-message Raw views when a Base64 HAR
  body has no MIME type or Content-Type header, preserving its BOM and Hex bytes.

## 0.1.21

- Correct both Raw tabs to offer exactly **文本** and **Hex**, showing the complete
  HTTP message in either mode: start line, all headers, separator and body.
- Append Base64-decoded body bytes directly after the serialized headers in Raw
  Hex, preserving binary values, character encodings and BOMs without re-encoding.
- Enable complete-message Raw Hex for text-only and empty bodies as well. Keep
  body-only viewers separate, with no extra encoding/provenance banners.

## 0.1.20

- Fix Raw Hex to display the independently captured body bytes, labeled
  **正文 Hex**, instead of UTF-8 re-encoding a reconstructed HTTP message.
- Only enable Hex for explicitly saved, valid Base64 bytes in Raw, body and
  standalone views; never invent bytes from text-only or missing captures.
- Remove encoding/provenance banners and their empty rows while preserving
  byte-exact selection/copy, charset-independent Hex and SVG text previews.

## 0.1.19

- Horizontally scroll the request list to read complete URLs, sizing the URL
  column from visible rows rather than truncating addresses with an ellipsis.
- Pin duration and status cells and their headers to the right, retaining row
  highlighting, column resizing and the vertically sticky header.
- Preserve horizontal position during keyboard request navigation, and resize
  the scrollable grid when filters or fonts change.

## 0.1.18

- Remove the Base64 byte-source hint and its row from Hex views in the inspector
  and standalone tabs, without changing decoded bytes, search or copy behavior.

## 0.1.17

- Use the shared read-only CodeMirror/Text and virtualized Hex viewer in both Raw
  tabs, with line numbers, search, byte selection/copy and resizable panel layout.
- Preserve complete reconstructed HTTP messages without body formatting or
  redaction, and explicitly distinguish them from captured transport bytes.
- Remember each Raw tab's display mode, update on request selection, and release
  inactive viewers; use the response's recorded HTTP version in its status line.

## 0.1.16

- Replace JSONEditor with a bundled, read-only CodeMirror 6 content viewer for
  JSON, XML, HTML, JavaScript, CSS and plain text in the inspector and body tabs.
- Add a virtualized Hex view with byte offsets, ASCII, byte search, selection and
  clipboard support; preserve Base64 bytes and label text-derived UTF-8 bytes.
- Add image zoom/pan/rotation, native audio/video controls and opt-in sandboxed
  HTML preview without scripts, external resources or navigation.
- Preserve original body payloads when opening tabs and switching display modes.
- Format JSON without rounding large integers or discarding duplicate keys.

## 0.1.15

- Package only the required browser bundles, UI assets and third-party notices,
  excluding duplicate Ace builds, examples, source maps and development files.
- Keep JSON code highlighting, formatting and folding without changing the viewer.
- Show XML, plain text and malformed JSON as original text without JSON validation
  error panels, including in standalone body tabs.
- Verify the actual VSIX's size, resources and body-viewer behavior before publishing.

## 0.1.6

- Fix quick-filter group lookup so every toolbar button filters requests correctly,
  with OR within groups and AND across groups.
- Normalize domains consistently in dropdown options and request entries, recognize
  WebSocket handshakes and SVG images, and use captured response metadata as fallbacks.
- Search full request/response headers and bodies, including UTF-8 base64 text,
  with value-based prefix and exact matching.
- Preserve native toolbar keyboard controls and restrict request navigation to
  visible results; close stale inspectors when their request is filtered out.
- Add DOM interaction regression tests for toolbar controls and filter combinations.

## 0.1.5

- Rebrand the extension as `Har Assist` with extension ID
  `yeceen.har-assist` and repository `ceendev/har-assist`.
- Replace the previous artwork with a new network-flow and assistant-spark icon.

## 0.1.4

- Reveal a copy button when hovering or focusing the Inspector URL bar.
- Replace the copy icon with a checkmark briefly after a successful copy while
  retaining pointer-local feedback.

## 0.1.3

- Show URL copy feedback beside the pointer instead of in VS Code's global
  notification area.

## 0.1.2

- Copy the selected request URL to the system clipboard by double-clicking the
  Inspector URL bar.
- Show a VS Code notification after the URL is copied.
- Correct the response Inspector's expand and collapse chevrons.

## 0.1.1

- Move the selected request URL into the top Inspector bar.
- Allow long URLs to be scrolled with the scrollbar, mouse/touch dragging,
  mouse wheel, or keyboard navigation.

## 0.1.0

- Rebrand the extension as `yeceen.har-editor` with an original icon and an
  independent Marketplace presentation.
- Open `.har` files automatically through a read-only custom editor.
- Load HAR content directly without VS Code's text-document size limit.
- Add domain, application, protocol, method, content-type, status, and text
  filters.
- Show sequence numbers, application names, and complete URLs in the request
  list.
- Redesign the inspector as resizable request and response sections.
- Add draggable request/inspector splitting and resizable table columns.

Earlier development history remains available in the Git repository.
