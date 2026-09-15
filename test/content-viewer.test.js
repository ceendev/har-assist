const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');
const sources = ['request', 'response'];
const viewerFor = (ui, source) => ui.query('[data-body-source="' + source + '"]');
const rawViewerFor = (ui, source) => ui.query('[data-raw-source="' + source + '"]');
const openRaw = (ui, source) => ui.click('.' + source + '-panel .tab[name="原始"]');
const openBody = (ui, source) => ui.click('.' + source + '-panel .tab[name="' + (source === 'request' ? '请求体' : '响应体') + '"]');
const encodedEntry = (request, response, mime = 'text/plain') => {
    const item = entry(Buffer.from(request).toString('base64'), Buffer.from(response).toString('base64'), mime);
    item.request.postData.encoding = item.response.content.encoding = 'base64';
    return item;
};

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
        assert.deepEqual(Array.from(viewer.querySelectorAll('[data-body-mode]'), el => el.textContent), ['文本', 'Hex']);
        assert.equal(viewer.parentElement.querySelector('.raw-code').textContent, '');
        assert.equal(viewer.parentElement.querySelector('.raw-code').hidden, true);
        ui.click('[data-raw-source="' + source + '"] .body-search');
        assert.ok(viewer.querySelector('.cm-search'));
        ui.click('[data-raw-source="' + source + '"] [data-body-mode="hex"]');
        assert.equal(viewer.querySelector('[data-body-mode="hex"]').disabled, false);
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(raw)));
        assert.equal(api.hexBody, api.body, 'Both modes must share the complete HTTP message');
        assert.ok(api.hex);
        assert.equal(api.getMode(), 'hex');
        assert.equal(viewer.parentElement.querySelector('.body-note'), null);
        api.setMode('text');
        assert.equal(api.getText(), raw);
    }
    assert.equal(ui.window.injected, undefined);
    assert.equal(JSON.stringify(ui.window.selectedReq.obj), captured);
});

test('Raw text decodes untyped Base64 as UTF-8 while Hex retains the entire message', async t => {
    const body = '\uFEFF中文😀';
    const item = encodedEntry(body, body);
    delete item.request.postData.mimeType;
    delete item.response.content.mimeType;
    const ui = await openDOM(t, createHost().main, [item]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        openRaw(ui, source);
        const api = ui.window.rawViewers[source];
        const expected = (source === 'request' ? 'POST /api HTTP/1.1' : 'HTTP/1.1 200 OK') + '\n\n' + body;
        api.setMode('text');
        assert.equal(api.getText(), expected);
        api.setMode('hex');
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(expected)));
    }
});

test('Raw viewers preserve modes, track selection and release inactive or closed instances', async t => {
    const ui = await openDOM(t, createHost().main, [encodedEntry('first request', 'first response'), encodedEntry('next request', 'next response')]);
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
    assert.equal(ui.window.rawViewers.request.body.text, 'POST /api HTTP/1.1\n\nnext request');
    assert.equal(Buffer.from(ui.window.rawViewers.request.body.bytes).toString(), 'POST /api HTTP/1.1\n\nnext request');
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
    const ui = await openDOM(t, createHost().main, [encodedEntry(raw, raw)]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        openRaw(ui, source);
        const viewer = rawViewerFor(ui, source), api = ui.window.rawViewers[source];
        assert.equal(api.getText(), source === 'request' ? ui.window.selectedReq.rawRequest : ui.window.selectedReq.rawResponse);
        assert.equal(ui.window.getComputedStyle(viewer).flexGrow, '1');
        assert.equal(ui.window.getComputedStyle(viewer.closest('.page')).overflow, 'hidden');
        assert.equal(ui.window.getComputedStyle(viewer.parentElement).display, 'flex');
        api.setMode('hex');
        assert.ok(viewer.querySelectorAll('.hex-row').length < 50);
        assert.deepEqual(Array.from(api.hexBody.bytes.subarray(-7)), [0xe4, 0xb8, 0xad, 0xf0, 0x9f, 0x98, 0x80]);
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
        assert.equal(section.querySelector('.raw-code').textContent, source === 'request' ? ui.window.selectedReq.rawRequest : ui.window.selectedReq.rawResponse);
    }
    ui.window.HarBodyViewer.mount = mount;
    ui.window.renderRawViews();
    for (const source of sources) {
        const viewer = rawViewerFor(ui, source);
        assert.equal(viewer.hidden, false);
        assert.equal(viewer.parentElement.querySelector('.raw-code').textContent, '');
    }
});

test('both Raw modes include the whole HTTP message, with exact Base64 body bytes and no banners', async t => {
    const cases = [
        { bytes: Buffer.from([0, 255, 65]), mime: 'application/octet-stream' },
        { bytes: Buffer.from(Array.from({ length: 256 }, (_, i) => i)), mime: 'application/octet-stream' },
        { bytes: Buffer.from('d6d0cec4', 'hex'), mime: 'text/plain; charset=gb18030' },
        { bytes: Buffer.from('efbbbf7b2261223a317d', 'hex'), mime: 'application/json' }
    ];
    const items = cases.map(({ bytes, mime }) => {
        const item = encodedEntry(bytes, bytes, mime);
        const [mimeType, charset] = mime.split(';');
        item.request.postData.mimeType = item.response.content.mimeType = mimeType;
        item.request.headers = [{ name: 'X-Captured-Header', value: 'include in both modes' }, { name: 'X-Repeat', value: 'one' }, { name: 'X-Repeat', value: 'two' }];
        item.response.headers = [{ name: 'Content-Encoding', value: 'gzip' }, { name: 'Set-Cookie', value: 'secret=keep-me' }];
        // Charset may exist only in a header, not in the HAR content MIME.
        if (charset) {
            item.request.headers.push({ name: 'Content-Type', value: mime });
            item.response.headers.push({ name: 'Content-Type', value: mime });
        }
        return item;
    });
    const captured = JSON.stringify(items), host = createHost();
    const ui = await openDOM(t, host.main, items);
    ui.click('.request-items [index="0"]', true);
    for (const [index, { bytes, mime }] of cases.entries()) {
        ui.click('.request-items [index="' + index + '"]');
        for (const source of sources) {
            openRaw(ui, source);
            const viewer = rawViewerFor(ui, source), api = ui.window.rawViewers[source];
            api.setMode('text');
            const httpText = api.getText();
            const head = source === 'request' ? 'POST /api HTTP/1.1' : 'HTTP/1.1 200 OK';
            const headers = items[index][source].headers.map(({ name, value }) => name + ': ' + value);
            const prefix = [head, ...headers].join('\n') + '\n\n';
            const expected = Buffer.concat([Buffer.from(prefix), bytes]);
            const bodyText = mime === 'application/octet-stream' ? bytes.toString('latin1')
                : new TextDecoder(mime.includes('gb18030') ? 'gb18030' : 'utf-8', { ignoreBOM: true }).decode(bytes);
            assert.equal(api.body.text, prefix + bodyText);
            // CodeMirror represents CR/LF as line breaks; the underlying Raw
            // text and Hex retain the recorded body before editor normalization.
            assert.equal(httpText, (prefix + bodyText).replace(/\r\n?|\n/g, '\n'));
            assert.equal(api.body.capturedBytes, false, 'Serialized headers must not be claimed as wire captures');
            assert.deepEqual(Array.from(viewer.querySelectorAll('[data-body-mode]'), el => el.textContent), ['文本', 'Hex']);
            ui.click('[data-raw-source="' + source + '"] [data-body-mode="hex"]');
            assert.equal(api.getMode(), 'hex');
            assert.equal(api.editor, null);
            assert.deepEqual(Array.from(api.body.bytes), Array.from(expected));
            assert.deepEqual(Array.from(ui.window.bodyViewers[source].body.bytes), Array.from(bytes));
            assert.equal(viewer.parentElement.querySelector('.body-note'), null);
            assert.equal(viewer.querySelector('.body-viewer-content').firstElementChild.className, 'hex-controls');
            assert.equal(viewer.querySelector('[data-offset="0"]').textContent, expected[0].toString(16).padStart(2, '0').toUpperCase());
            assert.equal(viewer.querySelector('[data-offset="' + Buffer.byteLength(prefix) + '"]').textContent, bytes[0].toString(16).padStart(2, '0').toUpperCase());
            api.hex.select(0, expected.length - 1);
            ui.click('[data-raw-source="' + source + '"] .hex-controls button:nth-of-type(2)');
            await Promise.all(ui.pending);
            assert.equal(host.copiedTexts.at(-1), expected.toString('hex').match(/../g).join(' ').toUpperCase());
            // A selection across the separator must include headers and body.
            api.hex.select(Buffer.byteLength(prefix) - 2, Buffer.byteLength(prefix) + bytes.length - 1);
            ui.click('[data-raw-source="' + source + '"] .hex-controls button:nth-of-type(2)');
            await Promise.all(ui.pending);
            assert.equal(host.copiedTexts.at(-1), '0A 0A ' + bytes.toString('hex').match(/../g).join(' ').toUpperCase());
            ui.click('[data-raw-source="' + source + '"] [data-body-mode="text"]');
            assert.equal(api.getText(), httpText);
        }
    }
    assert.equal(JSON.stringify(ui.window.har.log.entries), captured);
});

test('text, invalid and unsupported encodings all offer Hex; Raw stays whole HTTP and body tabs stay body-only', async t => {
    const items = [entry('中😀', '中😀', 'text/plain'), entry('AP9B', 'AP9B', 'text/plain'), entry('invalid!', 'invalid!', 'application/octet-stream'), entry('AP9B', 'AP9B', 'application/octet-stream'), entry()];
    items[2].request.postData.encoding = items[2].response.content.encoding = 'base64';
    items[3].request.postData.encoding = items[3].response.content.encoding = 'unknown';
    delete items[4].request.postData.text; delete items[4].response.content.text;
    items[4].request.postData.encoding = items[4].response.content.encoding = 'base64';
    const host = createHost(), ui = await openDOM(t, host.main, items);
    ui.click('.request-items [index="0"]', true);
    for (const index of items.keys()) {
        ui.click('.request-items [index="' + index + '"]');
        for (const source of sources) {
            openRaw(ui, source);
            const rawViewer = rawViewerFor(ui, source), rawApi = ui.window.rawViewers[source];
            assert.equal(rawViewer.querySelector('[data-body-mode="hex"]').disabled, false);
            const rawText = rawApi.body.text;
            assert.equal(rawText, (source === 'request' ? 'POST /api HTTP/1.1' : 'HTTP/1.1 200 OK') + '\n\n' + (index < 4 ? ui.window.getBodyPayload(source).text : ''));
            rawApi.setMode('hex');
            assert.equal(rawApi.getMode(), 'hex');
            assert.deepEqual(Array.from(rawApi.body.bytes), Array.from(Buffer.from(rawText)));
            assert.equal(rawViewer.parentElement.querySelector('.body-note'), null);
            for (const [viewer, api] of [[viewerFor(ui, source), ui.window.bodyViewers[source]]]) {
                if (!api) continue;
                assert.equal(viewer.querySelector('[data-body-mode="hex"]').disabled, false);
                api.setMode('hex');
                assert.equal(api.getMode(), 'hex');
                assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(ui.window.getBodyPayload(source).text)));
                assert.ok(api.hex);
                assert.ok(viewer.querySelector('.hex-row'));
                assert.equal(viewer.parentElement.querySelector('.body-note'), null);
            }
            if (index < 4) {
                ui.click('.subscript[data-open-source="' + source + '"]', true);
                await Promise.all(ui.pending);
                const tab = await openDOM(t, host.panels.at(-1));
                assert.equal(tab.query('[data-body-mode="hex"]').disabled, false);
                assert.equal(tab.window.bodyViewer.getMode(), 'hex');
                assert.deepEqual(Array.from(tab.window.bodyViewer.body.bytes), Array.from(Buffer.from(ui.window.getBodyPayload(source).text)));
                assert.equal(tab.window.bodyViewer.getText(), ui.window.getBodyPayload(source).text);
            }
        }
    }
});

test('recorded SVG markup retains its preview and has Hex for the same SVG content', async t => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>中😀</text></svg>';
    const ui = await openDOM(t, createHost().main, [entry('', svg, 'image/svg+xml')]);
    ui.click('.request-items [index="0"]', true);
    const api = ui.window.bodyViewers.response, viewer = viewerFor(ui, 'response');
    assert.equal(api.getMode(), 'preview');
    assert.ok(viewer.querySelector('.body-image'));
    assert.equal(ui.window.blobResources.size, 1);
    assert.equal(api.body.capturedBytes, false);
    assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(svg)));
    assert.equal(viewer.querySelector('[data-body-mode="hex"]').disabled, false);
    api.setMode('hex');
    assert.equal(api.getMode(), 'hex');
    assert.equal(ui.window.blobResources.size, 0);
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

test('JSON, malformed JSON, text, XML, HTML, JS and CSS have unformatted Hex in both body panels and new tabs', async t => {
    const cases = [[' {\r\n"id":9007199254740993,"id":2,"text":"中😀 \\u0041"\r\n}\t', 'application/json', 'json'], ['{"broken":', 'application/json', 'text'], ['\uFEFFhello\r\n<&world 中😀', 'text/plain', 'text'], ['<?xml version="1.0"?><root>text</root>', 'application/xml', 'xml'], ['<p>hello</p>', 'text/html', 'html'], ['const x = 1;', 'application/javascript', 'javascript'], ['p { color: red; }', 'text/css', 'css']];
    const items = cases.map(([text, mime]) => entry(text, text, mime));
    const captured = JSON.stringify(items), host = createHost();
    const ui = await openDOM(t, host.main, items);
    ui.click('.request-items [index="0"]', true);
    for (const [index, [text, mime, language]] of cases.entries()) {
        ui.click('.request-items [index="' + index + '"]');
        for (const source of sources) {
            openBody(ui, source);
            const api = ui.window.bodyViewers[source];
            assert.equal(api.body.language, language, mime);
            assert.equal(api.body.text, text);
            assert.equal(api.editor.state.readOnly, true);
            const displayed = api.getText(), viewer = viewerFor(ui, source);
            assert.equal(viewer.querySelector('.jsoneditor-text-errors'), null);
            assert.equal(viewer.querySelector('[data-body-mode="hex"]').disabled, false);
            ui.click('[data-body-source="' + source + '"] [data-body-mode="hex"]');
            assert.equal(api.getMode(), 'hex');
            const expected = Buffer.from(text);
            assert.deepEqual(Array.from(api.body.bytes), Array.from(expected));
            assert.equal(viewer.parentElement.querySelector('.body-note'), null);
            api.hex.select(0, expected.length - 1);
            ui.click('[data-body-source="' + source + '"] .hex-controls button:nth-of-type(2)');
            await Promise.all(ui.pending);
            assert.equal(host.copiedTexts.at(-1), expected.toString('hex').match(/../g).join(' ').toUpperCase());
            ui.click('.subscript[data-open-source="' + source + '"]', true);
            await Promise.all(ui.pending);
            const tab = await openDOM(t, host.panels.at(-1)), tabApi = tab.window.bodyViewer;
            assert.equal(tabApi.getMode(), 'hex');
            assert.equal(tab.query('[data-body-mode="hex"]').disabled, false);
            assert.deepEqual(Array.from(tabApi.body.bytes), Array.from(expected));
            assert.equal(tab.query('.body-note'), null);
            api.setMode(language === 'text' ? 'text' : 'code');
            assert.equal(api.getText(), displayed, 'Switching Hex must not change the text/code view');
        }
    }
    assert.equal(JSON.stringify(ui.window.har.log.entries), captured);
});

for (const encoding of ['', 'base64']) {
test('JSON Hex supports selection, search and clipboard for ' + (encoding || 'plain text') + ' bodies without using formatted JSON', async t => {
    const raw = '{"id":9007199254740993,"t":"中😀"}';
    const encoded = encoding ? Buffer.from(raw).toString('base64') : raw;
    const item = entry(encoded, encoded); item.request.postData.encoding = item.response.content.encoding = encoding;
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
}

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
        assert.equal(tab.query('[data-body-mode="hex"]').disabled, false);
        assert.equal(tab.query('.body-note'), null);
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
