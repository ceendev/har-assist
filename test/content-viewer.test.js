const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');
const sources = ['request', 'response'];
const viewerFor = (ui, source) => ui.query('[data-body-source="' + source + '"]');
const rawViewerFor = (ui, source) => ui.query('[data-raw-source="' + source + '"]');
const openRaw = (ui, source) => ui.click('.' + source + '-panel .tab[name="原始"]');

test('both Raw tabs use the shared read-only text/Hex controls without formatting or redaction', async t => {
    const body = '{"exact":9007199254740993,"text":"中😀<script>window.injected=1</script>"}';
    const item = entry(body, body);
    item.request.headers = [{ name: 'Authorization', value: 'Bearer captured-secret' }, { name: 'X-Repeat', value: 'first' }, { name: 'X-Repeat', value: 'second' }];
    item.response.headers = [{ name: 'Set-Cookie', value: 'session=captured-cookie' }];
    item.response.httpVersion = 'HTTP/2';
    const captured = JSON.stringify(item);
    const host = createHost(), ui = await openDOM(t, host.main, [item]);
    assert.equal(ui.window.rawViewers.response, null);
    ui.click('.request-items [index="0"]', true);
    assert.equal(ui.window.rawViewers.request, null, 'Inactive Raw tab must remain lazy');
    for (const source of sources) {
        openRaw(ui, source);
        const viewer = rawViewerFor(ui, source), api = ui.window.rawViewers[source];
        const raw = source === 'request' ? ui.window.selectedReq.rawRequest : ui.window.selectedReq.rawResponse;
        assert.equal(api.getMode(), 'text');
        assert.equal(api.getText(), raw);
        assert.ok(raw.endsWith('\n\n' + body), 'The HTTP body must not be indented or converted to a preview');
        assert.match(raw, source === 'request' ? /Authorization: Bearer captured-secret\nX-Repeat: first\nX-Repeat: second/ : /^HTTP\/2 200 OK\nSet-Cookie: session=captured-cookie/);
        assert.equal(api.editor.state.readOnly, true);
        assert.equal(api.editor.contentDOM.getAttribute('contenteditable'), 'false');
        assert.ok(viewer.querySelector('.cm-lineNumbers'));
        assert.deepEqual(Array.from(viewer.querySelectorAll('[data-body-mode]'), el => el.dataset.bodyMode), ['text', 'hex']);
        assert.equal(viewer.parentElement.querySelector('.raw-code').textContent, '');
        assert.equal(viewer.parentElement.querySelector('.raw-code').hidden, true);
        ui.click('[data-raw-source="' + source + '"] .body-search');
        assert.ok(viewer.querySelector('.cm-search'));
        ui.click('[data-raw-source="' + source + '"] [data-body-mode="hex"]');
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(raw)));
        assert.match(viewer.querySelector('.body-note').textContent, /UTF-8.*不代表原始/);
        api.hex.select(0, 3);
        ui.click('[data-raw-source="' + source + '"] .hex-controls button:nth-of-type(2)');
        await Promise.all(ui.pending);
        assert.equal(host.copiedTexts.at(-1), Buffer.from(raw).subarray(0, 4).toString('hex').match(/../g).join(' ').toUpperCase());
        ui.click('[data-raw-source="' + source + '"] [data-body-mode="text"]');
        assert.equal(api.getText(), raw);
    }
    assert.equal(ui.window.injected, undefined);
    assert.equal(JSON.stringify(ui.window.selectedReq.obj), captured);
});

test('Raw viewers preserve modes, track selection and release inactive or closed instances', async t => {
    const ui = await openDOM(t, createHost().main, [entry(), entry('next request', 'next response', 'text/plain')]);
    ui.click('.request-items [index="0"]', true);
    openRaw(ui, 'request');
    const firstRequest = ui.window.rawViewers.request, firstResponse = ui.window.rawViewers.response;
    firstRequest.setMode('hex');
    ui.click('[data-raw-source="response"] .body-search');
    ui.click('.request-panel .tab[name="请求头"]');
    assert.equal(ui.window.rawViewers.request, null);
    assert.equal(firstRequest.hex, null);
    assert.equal(ui.window.rawViewers.response, firstResponse);
    assert.ok(rawViewerFor(ui, 'response').querySelector('.cm-search'), 'Other panel must keep its current viewer and search');
    openRaw(ui, 'request');
    assert.equal(ui.window.rawViewers.request.getMode(), 'hex');
    ui.click('.request-items [index="1"]');
    assert.equal(firstResponse.editor, null);
    assert.equal(ui.window.rawViewers.request.getMode(), 'hex');
    assert.ok(ui.window.rawViewers.request.body.original.endsWith('\n\nnext request'));
    assert.ok(ui.window.rawViewers.response.getText().endsWith('\n\nnext response'));
    ui.click('.inspector-close');
    assert.equal(ui.window.rawViewers.request, null);
    assert.equal(ui.window.rawViewers.response, null);
    assert.equal(ui.window.document.querySelectorAll('.cm-editor, .hex-row').length, 0);
    ui.click('.request-items [index="0"]', true);
    ui.window.loadHAR(JSON.stringify({ log: { entries: [entry()] } }));
    assert.equal(ui.window.document.querySelectorAll('.cm-editor, .hex-row').length, 0);
    assert.equal(ui.window.document.querySelectorAll('.request-panel .page.show').length, 1);
    assert.equal(ui.window.document.querySelectorAll('.response-panel .page.show').length, 1);
});

test('large Raw messages use virtualized Hex and fitted layout, with intact fallback text on load failure', async t => {
    const raw = 'x'.repeat(1024 * 1024) + '\n中😀';
    const ui = await openDOM(t, createHost().main, [entry(raw, raw, 'text/plain')]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        openRaw(ui, source);
        const viewer = rawViewerFor(ui, source), api = ui.window.rawViewers[source];
        assert.ok(api.getText().endsWith(raw));
        assert.equal(ui.window.getComputedStyle(viewer).flexGrow, '1');
        assert.equal(ui.window.getComputedStyle(viewer.closest('.page')).overflow, 'hidden');
        assert.equal(ui.window.getComputedStyle(viewer.parentElement).display, 'flex');
        api.setMode('hex');
        assert.ok(viewer.querySelectorAll('.hex-row').length < 50);
        assert.deepEqual(Array.from(api.body.bytes.subarray(-7)), [0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80]);
        ui.click('.' + source + '-panel .tab[name="' + (source === 'request' ? '请求头' : '响应头') + '"]');
    }
    const mount = ui.window.HarBodyViewer.mount;
    ui.window.HarBodyViewer.mount = () => { throw new Error('Simulated failure'); };
    for (const source of sources) {
        openRaw(ui, source);
        const viewer = rawViewerFor(ui, source), section = viewer.parentElement;
        assert.equal(viewer.hidden, true);
        assert.equal(section.querySelector('.body-viewer-error').hidden, false);
        assert.equal(section.querySelector('.raw-code').hidden, false);
        assert.ok(section.querySelector('.raw-code').textContent.endsWith(raw));
    }
    ui.window.HarBodyViewer.mount = mount;
    ui.window.renderRawViews();
    for (const source of sources) {
        const viewer = rawViewerFor(ui, source);
        assert.equal(viewer.hidden, false);
        assert.equal(viewer.parentElement.querySelector('.raw-code').textContent, '');
    }
});

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
        assert.equal(viewer.querySelector('.body-note'), null);
        assert.equal(viewer.querySelector('.body-viewer-content').firstElementChild.className, 'hex-controls', 'No blank hint row should remain');
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
        if (source === 'response') assert.equal(tab.query('.body-note'), null, 'Standalone Base64 Hex must also omit the hint');
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
