# Changelog

All notable changes to Har Assist are documented here.

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
