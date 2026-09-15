/* eslint-env browser */
// Shared, read-only viewer. esbuild produces the single shipped browser bundle.
const { EditorState } = require('@codemirror/state');
const { EditorView, lineNumbers, keymap, highlightActiveLineGutter } = require('@codemirror/view');
const { foldGutter, foldKeymap, foldAll, unfoldAll, syntaxHighlighting, HighlightStyle } = require('@codemirror/language');
const { tags } = require('@lezer/highlight');
const { defaultKeymap } = require('@codemirror/commands');
const { search, searchKeymap, openSearchPanel, searchPanelOpen } = require('@codemirror/search');
const { json } = require('@codemirror/lang-json');
const { xml } = require('@codemirror/lang-xml');
const { html } = require('@codemirror/lang-html');
const { javascript } = require('@codemirror/lang-javascript');
const { css } = require('@codemirror/lang-css');
const { describe, describeHTTP, prettyJSON, hexRow } = require('./body-data');
const { mountHex } = require('./hex-view');
window.HarOverview = require('./overview');

let hostApi;
let copySequence = 0;
const pendingCopies = new Map();
window.addEventListener('message', event => {
    if (event.source && event.source !== window && event.source !== window.parent) return;
    if (event.data && event.data.command === 'copyBodyResult') {
        const complete = pendingCopies.get(event.data.id);
        if (complete) complete(event.data.success);
    }
});
function copyText(text) {
    if (!hostApi) return navigator.clipboard.writeText(text);
    return new Promise((resolve, reject) => {
        const id = ++copySequence;
        const timer = setTimeout(() => complete(false), 5000);
        function complete(success) {
            clearTimeout(timer); pendingCopies.delete(id);
            if (success) resolve(); else reject(new Error('Clipboard unavailable'));
        }
        pendingCopies.set(id, complete);
        hostApi.postMessage({ action: 'copyBody', id, text });
    });
}
const theme = EditorView.theme({
    '&': { height: '100%', color: 'var(--vscode-editor-foreground, #333)', backgroundColor: 'var(--vscode-editor-background, white)' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vscode-editor-font-family, monospace)' },
    '.cm-gutters': { color: 'var(--vscode-editorLineNumber-foreground, #888)', backgroundColor: 'var(--vscode-editor-background, white)', borderRight: '1px solid var(--vscode-panel-border, #ddd)' },
    '.cm-activeLineGutter': { backgroundColor: 'var(--vscode-list-hoverBackground, #eee)' },
    '.cm-foldPlaceholder': { color: 'var(--vscode-editor-foreground, #333)', backgroundColor: 'var(--vscode-list-hoverBackground, #eee)', borderColor: 'var(--vscode-panel-border, #ddd)' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--vscode-editor-selectionBackground, #b7d7ff) !important' },
    '.cm-panels': { backgroundColor: 'var(--vscode-editor-background, white)', color: 'var(--vscode-editor-foreground, #333)' }
});
const highlighting = HighlightStyle.define([
    { tag: tags.string, color: 'var(--vscode-debugTokenExpression-string, #a31515)' },
    { tag: tags.number, color: 'var(--vscode-debugTokenExpression-number, #098658)' },
    { tag: [tags.bool, tags.null, tags.keyword], color: 'var(--vscode-debugTokenExpression-boolean, #0000ff)' },
    { tag: [tags.propertyName, tags.attributeName], color: 'var(--vscode-symbolIcon-propertyForeground, #0451a5)' },
    { tag: tags.tagName, color: 'var(--vscode-symbolIcon-keywordForeground, #800000)' },
    { tag: tags.comment, color: 'var(--vscode-descriptionForeground, #777)', fontStyle: 'italic' }
]);

function previewHTML(text, baseURL) {
    let url;
    try { url = new URL(baseURL); } catch (_) { return text; }
    if (!['http:', 'https:'].includes(url.protocol)) return text;
    // Only the preview document gains a base URL. Keep scripts, resources,
    // navigation, forms and any policies supplied by the page itself intact.
    const doc = new DOMParser().parseFromString(text, 'text/html');
    const recordedBase = doc.querySelector('base[href]');
    if (recordedBase) {
        try { recordedBase.setAttribute('href', new URL(recordedBase.getAttribute('href'), url).href); } catch (_) { /* Retain an invalid recorded base verbatim. */ }
    } else {
        const base = doc.createElement('base'); base.setAttribute('href', url.href); doc.head.prepend(base);
    }
    const doctype = doc.doctype ? new XMLSerializer().serializeToString(doc.doctype) : '';
    return doctype + doc.documentElement.outerHTML;
}

function mount(container, text, mimeType, options = {}) {
    const body = options.httpMessage
        ? describeHTTP(text, options.httpMessage.prefix, options.httpMessage.payload)
        : describe(text, mimeType, options.encoding || '');
    const doc = container.ownerDocument;
    const node = (tag, className, text) => { const el = doc.createElement(tag); el.className = className; if (text != null) el.textContent = text; return el; };
    container.classList.add('body-viewer'); container.replaceChildren();
    const tools = node('div', 'body-viewer-tools'); tools.setAttribute('role', 'toolbar'); tools.setAttribute('aria-label', '内容显示方式');
    const content = node('div', 'body-viewer-content'); container.append(tools, content);
    const modes = [];
    if (body.textual && body.language !== 'text') modes.push(['code', body.language.toUpperCase()]);
    if (body.textual) modes.push(['text', '文本']);
    modes.push(['hex', 'Hex']);
    if (body.preview) modes.push(['preview', '预览']);
    const buttons = new Map();
    let mode, editor = null, hex = null, cleanupPreview = () => {}, destroyed = false, formatted;
    const api = {
        body,
        hexBody: body,
        get editor() { return editor; },
        get hex() { return hex; },
        getMode: () => mode,
        getText: () => editor ? editor.state.doc.toString() : body.text,
        setMode,
        foldAll: () => editor && foldAll(editor),
        unfoldAll: () => editor && unfoldAll(editor),
        destroy() {
            if (destroyed) return; destroyed = true;
            if (observer) observer.disconnect();
            disposeContent(); container.replaceChildren();
        }
    };
    function disposeContent() {
        if (editor) editor.destroy(); editor = null;
        if (hex) hex.destroy(); hex = null;
        cleanupPreview(); cleanupPreview = () => {}; content.replaceChildren();
    }
    function preview() {
        if (body.preview === 'html') {
            const consent = node('div', 'body-html-consent');
            consent.append(node('strong', '', '真实预览安全提醒'));
            consent.append(node('p', '', '真实预览会执行 HTML 中的脚本、加载外部资源，链接和表单可能向真实网站发送请求。请仅预览可信内容。'));
            const start = node('button', 'body-html-start', '开始真实预览'); start.type = 'button';
            start.addEventListener('click', () => {
                if (destroyed || mode !== 'preview' || !content.contains(consent)) return;
                const frame = node('iframe', 'body-html-preview');
                frame.title = 'HTML 真实预览';
                // Do not grant same-origin or top-navigation access to the VS
                // Code host. Only this explicit click enables active content.
                frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals');
                frame.referrerPolicy = 'no-referrer';
                frame.srcdoc = previewHTML(body.text, options.baseURL); content.replaceChildren(frame);
            });
            consent.append(start); content.append(consent); return;
        }
        if (!body.capturedBytes && body.mime !== 'image/svg+xml') {
            content.append(node('div', 'body-note', 'HAR 未保存可预览的二进制内容。')); return;
        }
        // SVG can be rendered directly from its recorded markup. This does
        // not make the browser's Blob serialization a captured byte source.
        const url = URL.createObjectURL(new Blob([body.bytes || body.text], { type: body.mime }));
        if (body.preview === 'image') {
            const controls = node('div', 'body-image-controls'), viewport = node('div', 'body-image-scroll'), stage = node('div', 'body-image-stage');
            const img = node('img', 'body-image'); img.alt = 'HAR 图片预览'; img.draggable = false;
            let zoom = 1, angle = 0, fitting = true;
            const refresh = () => {
                if (!img.naturalWidth) return;
                const swapped = angle % 180 !== 0;
                if (fitting) zoom = Math.min(1, (viewport.clientWidth || 500) / (swapped ? img.naturalHeight : img.naturalWidth), (viewport.clientHeight || 300) / (swapped ? img.naturalWidth : img.naturalHeight));
                const w = img.naturalWidth * zoom, h = img.naturalHeight * zoom;
                stage.style.width = (swapped ? h : w) + 'px'; stage.style.height = (swapped ? w : h) + 'px';
                img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
            };
            for (const [label, action] of [
                ['缩小', () => { fitting = false; zoom = Math.max(0.05, zoom / 1.25); }],
                ['放大', () => { fitting = false; zoom = Math.min(16, zoom * 1.25); }],
                ['旋转', () => { angle = (angle + 90) % 360; }],
                ['适应', () => { fitting = true; }]
            ]) { const button = node('button', '', label); button.addEventListener('click', () => { action(); refresh(); }); controls.append(button); }
            let drag;
            viewport.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId); });
            viewport.addEventListener('pointermove', event => { if (drag) { viewport.scrollLeft = drag.left - event.clientX + drag.x; viewport.scrollTop = drag.top - event.clientY + drag.y; } });
            viewport.addEventListener('pointerup', () => { drag = null; }); viewport.addEventListener('pointercancel', () => { drag = null; });
            img.onload = refresh;
            img.onerror = () => content.append(node('div', 'body-note', '图片内容不完整或格式不受支持，可切换 Hex 查看。'));
            stage.append(img); viewport.append(stage); content.append(controls, viewport); img.src = url;
            const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
            if (resize) resize.observe(viewport);
            cleanupPreview = () => { if (resize) resize.disconnect(); img.onload = img.onerror = null; img.removeAttribute('src'); URL.revokeObjectURL(url); };
        } else {
            const media = node(body.preview, 'body-media'); media.controls = true; media.preload = 'metadata';
            media.onerror = () => { if (!content.querySelector('.body-note')) content.append(node('div', 'body-note', '当前 VS Code 不支持此音视频编码，或 HAR 内容不完整；可切换 Hex 查看。')); };
            content.append(media); media.src = url;
            cleanupPreview = () => { media.onerror = null; media.pause(); media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); };
        }
    }
    function setMode(next) {
        if (destroyed || !buttons.has(next)) return;
        disposeContent(); mode = next; container.dataset.mode = mode;
        searchButton.hidden = mode === 'preview';
        searchButton.setAttribute('aria-expanded', 'false');
        for (const [key, button] of buttons) { button.classList.toggle('selected', key === mode); button.setAttribute('aria-pressed', String(key === mode)); }
        if (mode === 'hex') {
            hex = mountHex(content, body, copyText, open => searchButton.setAttribute('aria-expanded', String(open)));
            return;
        }
        if (mode === 'preview') { preview(); return; }
        let value = body.text;
        const extensions = [EditorState.readOnly.of(true), EditorView.editable.of(false), lineNumbers(), highlightActiveLineGutter(),
            theme, search({ top: true }),
            EditorState.phrases.of({ Find: '查找', next: '下一个', previous: '上一个', all: '全部', 'match case': '区分大小写', regexp: '正则', 'by word': '全字匹配', close: '关闭查找' }),
            EditorView.updateListener.of(update => searchButton.setAttribute('aria-expanded', String(searchPanelOpen(update.state)))),
            keymap.of([...searchKeymap, ...foldKeymap, ...defaultKeymap]), EditorView.contentAttributes.of({ 'aria-label': '只读内容', tabindex: '0' })];
        if (mode === 'code') {
            if (body.json) { if (formatted == null) formatted = prettyJSON(body.text); value = formatted; }
            const language = { json, xml, html, javascript, css }[body.language];
            if (language) extensions.push(language(), foldGutter(), syntaxHighlighting(highlighting));
        }
        editor = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: content });
    }
    for (const [key, label] of modes) {
        const button = node('button', '', label); button.type = 'button'; button.dataset.bodyMode = key;
        button.addEventListener('click', () => setMode(key)); tools.append(button); buttons.set(key, button);
    }
    const searchButton = node('button', 'body-search', '查找'); searchButton.type = 'button';
    searchButton.addEventListener('click', () => { if (editor) openSearchPanel(editor); else if (hex) hex.openSearch(); }); tools.append(searchButton);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (editor) editor.requestMeasure(); }) : null;
    if (observer) observer.observe(content);
    const initial = body.textual ? (body.language === 'text' ? 'text' : 'code') : body.preview ? 'preview' : 'hex';
    try { setMode(buttons.has(options.mode) ? options.mode : initial); }
    catch (error) { api.destroy(); throw error; }
    return api;
}

window.HarBodyViewer = { describe, mount, prettyJSON, hexRow, previewHTML, setHostApi: api => { hostApi = api; } };
