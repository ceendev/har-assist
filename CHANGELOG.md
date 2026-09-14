# Changelog

All notable changes to Har Assist are documented here.

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
