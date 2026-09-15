const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');
const sources = ['request', 'response'];
const viewerFor = (ui, source) => ui.query('[data-body-source="' + source + '"]');

test('CodeMirror opens formatted JSON read-only, folds code and follows inspector selection', async t => {
    const ui = await openDOM(t, createHost().main, [entry(), entry('{"other":3}', '{"other":4}')]);
    ui.click('.request-items [index="0"]');
    assert.equal(ui.query('.main-layout').classList.contains('has-inspector'), false);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        const viewer = viewerFor(ui, source), api = ui.window.bodyViewers[source];
        assert.equal(viewer.hidden, false);
        assert.equal(api.getMode(), 'code');
        assert.equal(api.body.language, 'json');
        assert.equal(api.editor.state.readOnly, true);
        assert.equal(api.editor.contentDOM.getAttribute('contenteditable'), 'false');
        assert.ok(api.editor.state.doc.lines > 1);
        assert.ok(viewer.querySelector('.cm-content span'), 'Syntax highlighting must be present');
        api.foldAll(); assert.ok(viewer.querySelector('.cm-foldPlaceholder'));
        api.unfoldAll(); assert.equal(viewer.querySelector('.cm-foldPlaceholder'), null);
        ui.click('[data-body-source="' + source + '"] .body-search');
        assert.ok(viewer.querySelector('.cm-search'));
        assert.equal(viewer.querySelector('.jsoneditor-statusbar'), null);
        assert.equal(ui.window.getComputedStyle(viewer.parentElement.querySelector('.code-block')).display, 'none');
    }
    ui.click('.request-items [index="1"]');
    assert.equal(ui.window.bodyViewers.request.getText(), '{\n  "other": 3\n}');
    assert.equal(ui.window.bodyViewers.response.getText(), '{\n  "other": 4\n}');
    assert.equal(ui.window.document.querySelectorAll('.har-body-viewer .cm-editor').length, 2);
    ui.click('.inspector-close');
    assert.equal(ui.window.document.querySelectorAll('.cm-editor').length, 0);
});

test('invalid JSON, plain text, XML, HTML, JS and CSS remain intact and have no JSON error panels', async t => {
    const cases = [['{"broken":', 'application/json', 'text'], ['hello\n<&world', 'text/plain', 'text'], ['<?xml version="1.0"?><root>text</root>', 'application/xml', 'xml'], ['<p>hello</p>', 'text/html', 'html'], ['const x = 1;', 'application/javascript', 'javascript'], ['p { color: red; }', 'text/css', 'css']];
    const ui = await openDOM(t, createHost().main, cases.map(([text, mime]) => entry(text, text, mime)));
    ui.click('.request-items [index="0"]', true);
    for (const [index, [text, mime, language]] of cases.entries()) {
        ui.click('.request-items [index="' + index + '"]');
        for (const source of sources) {
            const api = ui.window.bodyViewers[source];
            assert.equal(api.body.language, language, mime);
            assert.equal(api.getText(), text);
            assert.equal(api.editor.state.readOnly, true);
            assert.equal(viewerFor(ui, source).querySelector('.jsoneditor-text-errors'), null);
        }
    }
});

test('Hex uses original bytes rather than formatted JSON, supports byte selection, search and host clipboard', async t => {
    const raw = '{"id":9007199254740993,"t":"中😀"}';
    const encoded = Buffer.from(raw).toString('base64');
    const item = entry(encoded, encoded); item.request.postData.encoding = item.response.content.encoding = 'base64';
    const host = createHost(), ui = await openDOM(t, host.main, [item]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        const api = ui.window.bodyViewers[source];
        assert.match(api.getText(), /9007199254740993/);
        api.setMode('hex');
        assert.equal(api.editor, null);
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(raw)));
        const viewer = viewerFor(ui, source);
        assert.match(viewer.querySelector('.body-note').textContent, /Base64/);
        // Repeated Shift+Left must extend from the moving cursor, not the
        // maximum selected offset; then Shift+Right shrinks the same range.
        const cell = viewer.querySelector('[data-offset="5"]');
        cell.dispatchEvent(new ui.window.MouseEvent('click', { bubbles: true }));
        const scroll = viewer.querySelector('.hex-scroll');
        const arrow = key => scroll.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true }));
        arrow('ArrowLeft'); arrow('ArrowLeft');
        assert.deepEqual(Array.from(viewer.querySelectorAll('.hex-byte.selected'), el => Number(el.dataset.offset)), [3, 4, 5]);
        arrow('ArrowRight');
        assert.deepEqual(Array.from(viewer.querySelectorAll('.hex-byte.selected'), el => Number(el.dataset.offset)), [4, 5]);
        api.hex.select(0, 2);
        ui.click('[data-body-source="' + source + '"] .hex-controls button:nth-of-type(2)');
        await Promise.all(ui.pending);
        assert.equal(host.copiedTexts.at(-1), '7B 22 69');
        const query = viewer.querySelector('.hex-query'); query.value = 'F0 9F 98 80';
        query.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(viewer.querySelector('.hex-status').textContent, '4 字节已选');
        api.setMode('text'); assert.equal(api.getText(), raw);
        api.setMode('code'); assert.match(api.getText(), /\n/);
    }
    assert.equal(ui.window.reqs[0].obj.response.content.text, encoded);
});

test('new body tabs preserve original payload, encoding, mode and read-only controls', async t => {
    const raw = '{"test":"</script><script>window.injected=1</script>"}';
    const item = entry(raw, Buffer.from(raw).toString('base64'), 'text/plain');
    item.response.content.encoding = 'base64';
    const host = createHost(), ui = await openDOM(t, host.main, [item]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        ui.window.bodyViewers[source].setMode('hex');
        ui.click('.subscript[data-open-source="' + source + '"]', true);
        await Promise.all(ui.pending);
        const tab = await openDOM(t, host.panels.at(-1)), api = tab.window.bodyViewer;
        assert.equal(api.getMode(), 'hex');
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(raw)));
        api.setMode('code'); assert.equal(api.editor.state.readOnly, true);
        api.foldAll(); assert.ok(tab.query('.cm-foldPlaceholder'));
        assert.equal(tab.window.injected, undefined);
    }
});

test('image/audio/video previews bypass CodeMirror, revoke blobs and offer Hex in new tabs', async t => {
    for (const [mime, selector] of [['image/png', '.body-image'], ['audio/mpeg', 'audio'], ['video/mp4', 'video']]) {
        const item = entry('', 'AP9B', mime); item.response.content.encoding = 'base64';
        const host = createHost(), ui = await openDOM(t, host.main, [item, entry()]);
        ui.click('.request-items [index="0"]', true);
        const api = ui.window.bodyViewers.response;
        assert.equal(api.getMode(), 'preview');
        assert.equal(api.editor, null);
        assert.ok(viewerFor(ui, 'response').querySelector(selector));
        const media = viewerFor(ui, 'response').querySelector(selector);
        if (mime.startsWith('video') || mime.startsWith('audio')) { assert.equal(media.controls, true); assert.equal(media.autoplay, false); }
        assert.equal(ui.window.blobResources.size, 1);
        ui.click('.subscript[data-open-source="response"]', true); await Promise.all(ui.pending);
        const tab = await openDOM(t, host.panels.at(-1));
        assert.ok(tab.query(selector));
        api.setMode('hex'); assert.equal(ui.window.blobResources.size, 0);
        assert.deepEqual(Array.from(api.body.bytes), [0, 255, 65]);
        ui.click('.request-items [index="1"]'); assert.equal(ui.window.bodyViewers.response.getMode(), 'code');
    }
});

test('HTML preview is opt-in, sandboxed and strips active navigation/network markup without changing source', async t => {
    const raw = '<meta http-equiv="refresh" content="0;url=https://evil.test"><style>p{color:red}</style><script>window.injected=1</script><iframe src="https://evil.test"></iframe><a href="https://evil.test" onclick="alert(1)">link</a><img src="https://evil.test/x"><p>正文</p>';
    const ui = await openDOM(t, createHost().main, [entry(raw, raw, 'text/html')]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        const api = ui.window.bodyViewers[source];
        assert.equal(api.getMode(), 'code');
        api.setMode('preview');
        const frame = viewerFor(ui, source).querySelector('iframe');
        assert.equal(frame.getAttribute('sandbox'), '');
        assert.equal(frame.referrerPolicy, 'no-referrer');
        assert.match(frame.srcdoc, /Content-Security-Policy/);
        assert.match(frame.srcdoc, /default-src 'none'/);
        assert.doesNotMatch(frame.srcdoc, /<script|<iframe|onclick|href=|evil\.test|http-equiv="refresh"/);
        assert.match(frame.srcdoc, /正文/);
        api.setMode('text'); assert.equal(api.getText(), raw);
    }
});

test('large binary Hex renders only visible rows; empty bodies and missing-library fallback remain usable', async t => {
    const item = entry('', Buffer.alloc(1024 * 1024, 0xff).toString('base64'), 'application/octet-stream'); item.response.content.encoding = 'base64';
    const ui = await openDOM(t, createHost().main, [entry('', ''), item, entry()]);
    ui.click('.request-items [index="0"]', true);
    assert.equal(ui.window.bodyViewers.response, null);
    ui.click('.request-items [index="1"]');
    assert.equal(ui.window.bodyViewers.response.getMode(), 'hex');
    assert.ok(ui.window.document.querySelectorAll('.hex-row').length < 50);
    ui.click('.request-items [index="2"]');
    const viewer = viewerFor(ui, 'response'), action = viewer.parentElement.querySelector('.open-new-tab');
    assert.equal(ui.window.getComputedStyle(viewer.parentElement).display, 'flex');
    assert.equal(ui.window.getComputedStyle(viewer.closest('.page')).overflow, 'hidden');
    assert.equal(viewer.contains(action), false);
    assert.equal(ui.window.getComputedStyle(action).flexShrink, '0');
    ui.window.HarBodyViewer.mount = () => { throw new Error('Simulated failure'); };
    ui.click('.request-items [index="1"]');
    assert.equal(viewer.parentElement.querySelector('.body-viewer-error').hidden, false);
});
