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

test('collapsed request and response panels reserve only their header, with no minimum-height blank row', async t => {
    const ui = await openDOM(t, createHost().main, [entry()]);
    ui.click('.request-items [index="0"]', true);
    for (const source of sources) {
        const panel = ui.query('.' + source + '-panel');
        ui.click('.' + source + '-panel .inspector-panel-toggle');
        const style = ui.window.getComputedStyle(panel);
        const headerStyle = ui.window.getComputedStyle(panel.querySelector('.inspector-panel-header'));
        assert.equal(panel.classList.contains('collapsed'), true);
        assert.equal(style.flexBasis, headerStyle.flexBasis);
        assert.equal(style.flexGrow, '0');
        assert.equal(style.flexShrink, '0');
        assert.equal(parseFloat(style.minHeight), 0, 'Expanded minimum height must not leave space below the collapsed header');
        assert.equal(panel.querySelector('.inspector-panel-toggle').getAttribute('aria-expanded'), 'false');
        ui.click('.' + source + '-panel .inspector-panel-toggle');
        assert.equal(panel.classList.contains('collapsed'), false);
        assert.equal(ui.window.getComputedStyle(panel).minHeight, '62px');
        assert.equal(ui.window.getComputedStyle(panel.querySelector('.inspector-panel-content')).display, 'flex');
    }
    // Collapsing the remaining open panel must expand its partner, not hide both.
    ui.click('.request-panel .inspector-panel-toggle');
    ui.click('.response-panel .inspector-panel-toggle');
    assert.equal(ui.query('.request-panel').classList.contains('collapsed'), false);
    assert.equal(ui.query('.response-panel').classList.contains('collapsed'), true);
    assert.equal(ui.window.document.querySelectorAll('.inspector-panel.collapsed').length, 1);
});

test('response badges follow status classes when switching requests, even while collapsed', async t => {
    const cases = [
        [200, '2xx', 'green'], [0, 'other'], [100, '1xx', 'blue'], [199, '1xx', 'blue'],
        [201, '2xx', 'green'], [204, '2xx', 'green'], [299, '2xx', 'green'],
        [300, '3xx', 'yellow'], [304, '3xx', 'yellow'], [399, '3xx', 'yellow'],
        [400, '4xx', 'orange'], [404, '4xx', 'orange'], [499, '4xx', 'orange'],
        [500, '5xx', 'red'], [503, '5xx', 'red'], [599, '5xx', 'red'],
        [99, 'other'], [600, 'other'], [null, 'other'], [undefined, 'other'],
        ['404', '4xx', 'orange'], ['invalid', 'other'], [200, '2xx', 'green']
    ];
    const entries = cases.map(([status]) => {
        const item = entry();
        item.response.status = status;
        return item;
    });
    const ui = await openDOM(t, createHost().main, entries);
    ui.click('.request-items [index="0"]', true);
    const panel = ui.query('.response-panel');
    const badge = panel.querySelector('.inspector-status-badge');
    const protocol = panel.querySelector('.inspector-protocol-badge');
    const requestProtocol = ui.query('.request-panel .inspector-protocol-badge');
    const initialRequestBackground = ui.window.getComputedStyle(requestProtocol).backgroundColor;
    for (const collapsed of [false, true]) {
        if (collapsed) ui.click('.response-panel .inspector-panel-toggle');
        for (const [index, [status, group, color]] of cases.entries()) {
            ui.click('.request-items [index="' + index + '"]');
            assert.equal(panel.classList.contains('collapsed'), collapsed);
            assert.equal(panel.dataset.statusGroup, group, 'Status: ' + status);
            assert.equal(badge.textContent, status == null ? '' : String(status));
            const panelStyle = ui.window.getComputedStyle(panel);
            const background = panelStyle.getPropertyValue('--inspector-response-background');
            if (color) assert.ok(background.includes('--vscode-charts-' + color), 'Status: ' + status);
            else assert.equal(background, '', 'Unknown status must reset to neutral, not retain the previous color');
            assert.equal(panelStyle.getPropertyValue('--inspector-response-foreground').trim(), ['3xx', '4xx'].includes(group) ? '#202020' : '');
            for (const indicator of [badge, protocol]) {
                const style = ui.window.getComputedStyle(indicator);
                assert.ok(style.background.includes('--inspector-response-background'));
                assert.ok(style.background.includes('--vscode-badge-background'), 'Use a neutral fallback before selection or for unknown status');
                assert.ok(style.color.includes('--inspector-response-foreground'));
            }
            assert.equal(ui.window.getComputedStyle(requestProtocol).backgroundColor, initialRequestBackground, 'Response status must not recolor the request header');
            assert.equal(ui.window.selectedReq.obj.response.status, status, 'Status presentation must not alter HAR data');
        }
    }
    ui.click('.inspector-close');
    ui.click('.request-items [index="11"]', true);
    assert.equal(panel.dataset.statusGroup, '4xx', 'Reopening the Inspector must use the newly selected status');
});

test('text/code search uses themed readable controls and still finds content in both bodies and new tabs', async t => {
    const host = createHost(), ui = await openDOM(t, host.main, [entry('{"a":"needle","b":"needle"}', '{"a":"needle","b":"needle"}')]);
    ui.click('.request-items [index="0"]', true);
    function checkSearch(view, viewer, api) {
        // jsdom does not apply CodeMirror's generated selector specificity
        // correctly. Check the shipped override rules here; resolved theme
        // colors and layout are also verified in Chromium.
        const rules = Array.from(view.window.document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules));
        const themed = selector => rules.find(rule => rule.selectorText && rule.selectorText.split(',').map(s => s.trim()).includes(selector)).style;
        const buttonStyle = themed('.body-viewer .cm-editor .cm-search .cm-button');
        assert.equal(buttonStyle.backgroundImage || buttonStyle.getPropertyValue('background-image'), 'none');
        assert.ok(buttonStyle.color.includes('--vscode-button-secondaryForeground'));
        assert.ok(buttonStyle.background.includes('--vscode-button-secondaryBackground'));
        const inputStyle = themed('.body-viewer .cm-editor .cm-search .cm-textfield');
        assert.ok(inputStyle.color.includes('--vscode-input-foreground'));
        assert.ok(inputStyle.background.includes('--vscode-input-background'));
        assert.ok(themed('.body-viewer .cm-editor .cm-panels').background.includes('--vscode-editorWidget-background'));
        for (const mode of ['code', 'text']) {
            api.setMode(mode);
            const original = api.getText(), button = viewer.querySelector('.body-search');
            assert.equal(button.hidden, false);
            assert.equal(button.getAttribute('aria-expanded'), 'false');
            assert.equal(viewer.querySelector('.cm-search'), null);
            button.click();
            assert.equal(button.getAttribute('aria-expanded'), 'true');
            const panel = viewer.querySelector('.cm-search'), input = panel.querySelector('[name="search"]');
            assert.equal(input.placeholder, '查找');
            assert.equal(panel.querySelector('[name="replace"]'), null, 'Search must remain read-only');
            assert.deepEqual(Array.from(panel.querySelectorAll('.cm-button'), el => el.textContent), ['下一个', '上一个', '全部']);
            input.value = 'needle'; input.dispatchEvent(new view.window.Event('change', { bubbles: true }));
            panel.querySelector('[name="next"]').click();
            const first = api.editor.state.selection.main;
            assert.equal(api.editor.state.sliceDoc(first.from, first.to), 'needle');
            panel.querySelector('[name="next"]').click();
            assert.notEqual(api.editor.state.selection.main.from, first.from);
            panel.querySelector('[name="prev"]').click();
            assert.equal(api.editor.state.selection.main.from, first.from);
            panel.querySelector('[name="close"]').click();
            assert.equal(viewer.querySelector('.cm-search'), null);
            assert.equal(button.getAttribute('aria-expanded'), 'false');
            assert.equal(api.getText(), original);
        }
    }
    for (const source of sources) {
        openBody(ui, source);
        checkSearch(ui, viewerFor(ui, source), ui.window.bodyViewers[source]);
        ui.click('.subscript[data-open-source="' + source + '"]', true);
        await Promise.all(ui.pending);
        const tab = await openDOM(t, host.panels.at(-1));
        checkSearch(tab, tab.query('#body-editor'), tab.window.bodyViewer);
    }
});

test('Hex search is hidden until requested, closes without losing selection, and works in bodies, Raw and new tabs', async t => {
    const host = createHost(), ui = await openDOM(t, host.main, [entry('needle needle', 'needle needle', 'text/plain')]);
    ui.click('.request-items [index="0"]', true);
    async function checkSearch(view, viewer, api) {
        api.setMode('hex');
        const original = Array.from(api.body.bytes), controls = viewer.querySelector('.hex-controls');
        const button = viewer.querySelector('.body-search'), query = viewer.querySelector('.hex-query');
        const viewport = viewer.querySelector('.hex-scroll');
        const key = (target, name, options = {}) => target.dispatchEvent(new view.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...options }));
        assert.equal(controls.hidden, true);
        assert.equal(button.hidden, false);
        assert.equal(button.getAttribute('aria-expanded'), 'false');
        button.click(); button.click();
        assert.equal(viewer.querySelectorAll('.hex-controls').length, 1);
        assert.equal(controls.hidden, false);
        assert.equal(button.getAttribute('aria-expanded'), 'true');
        assert.equal(view.window.document.activeElement, query);
        query.value = '6E 65 65 64 6C 65'; key(query, 'Enter');
        await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(viewer.querySelector('.hex-status').textContent, '6 字节已选');
        const selected = Array.from(viewer.querySelectorAll('.hex-byte.selected'), el => el.dataset.offset);
        viewer.querySelector('.hex-search-close').click();
        assert.equal(controls.hidden, true);
        assert.equal(button.getAttribute('aria-expanded'), 'false');
        assert.equal(view.window.document.activeElement, viewport);
        assert.deepEqual(Array.from(viewer.querySelectorAll('.hex-byte.selected'), el => el.dataset.offset), selected);
        key(viewport, 'c', { ctrlKey: true }); await Promise.all(view.pending);
        assert.equal(host.copiedTexts.at(-1), '6E 65 65 64 6C 65', 'Keyboard copy must remain available while search is hidden');
        for (const modifier of ['ctrlKey', 'metaKey']) {
            assert.equal(key(viewport, 'f', { [modifier]: true }), false, 'Find shortcut must not open browser search');
            assert.equal(controls.hidden, false);
            assert.equal(button.getAttribute('aria-expanded'), 'true');
            assert.equal(query.value, '6E 65 65 64 6C 65');
            key(query, 'Escape');
            assert.equal(controls.hidden, true);
            assert.equal(button.getAttribute('aria-expanded'), 'false');
        }
        api.setMode('text');
        assert.equal(viewer.querySelector('.hex-controls'), null);
        button.click();
        assert.ok(viewer.querySelector('.cm-search'), 'Switching mode must retain a working search button');
        api.setMode('hex');
        assert.equal(viewer.querySelector('.hex-controls').hidden, true, 'A new Hex view starts compact again');
        assert.deepEqual(Array.from(api.body.bytes), original);
    }
    for (const source of sources) {
        openBody(ui, source);
        await checkSearch(ui, viewerFor(ui, source), ui.window.bodyViewers[source]);
        ui.click('.subscript[data-open-source="' + source + '"]', true);
        await Promise.all(ui.pending);
        const tab = await openDOM(t, host.panels.at(-1));
        await checkSearch(tab, tab.query('#body-editor'), tab.window.bodyViewer);
        openRaw(ui, source);
        await checkSearch(ui, rawViewerFor(ui, source), ui.window.rawViewers[source]);
    }
});

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
            ui.click('[data-raw-source="' + source + '"] .body-search');
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
            ui.click('[data-body-source="' + source + '"] .body-search');
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
        ui.click('[data-body-source="' + source + '"] .body-search');
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

test('HTML requires a fresh explicit confirmation before active preview in bodies and new tabs', async t => {
    const raw = '<!doctype html><html><head><link rel="stylesheet" href="theme.css"><script src="app.js"></script></head><body><script>window.injected=1</script><iframe src="nested.html"></iframe><a href="next.html" onclick="window.clicked=1">link</a><img src="image.png"><form action="submit" method="post"><input name="value" value="captured-secret"></form><template><p>template</p></template><p>正文😀</p></body></html>';
    const item = entry(raw, raw, 'text/html'); item.request.url = 'https://example.test/pages/document.html?q=1';
    item.response.content.text = Buffer.from(raw).toString('base64'); item.response.content.encoding = 'base64';
    const host = createHost(), ui = await openDOM(t, host.main, [item, item]);
    ui.click('.request-items [index="0"]', true);
    const captured = JSON.stringify(ui.window.har.log.entries);
    function checkGate(view, viewer, api) {
        api.setMode('preview');
        assert.equal(viewer.querySelector('iframe'), null, 'Selecting Preview must not create a browsing context or load page resources');
        assert.match(viewer.querySelector('.body-html-consent').textContent, /安全提醒.*执行 HTML.*真实网站/);
        const start = viewer.querySelector('.body-html-start');
        assert.equal(start.textContent, '开始真实预览');
        start.click();
        const frame = viewer.querySelector('iframe');
        view.window.dispatchEvent(new view.window.MessageEvent('message', { source: frame.contentWindow, data: { command: 'loadError', message: 'Untrusted preview message' } }));
        assert.equal(view.query('.load-error'), null, 'Preview messages must not be mistaken for extension-host messages');
        assert.equal(viewer.querySelector('.body-html-consent'), null);
        assert.equal(viewer.querySelector('.body-note'), null);
        const permissions = frame.getAttribute('sandbox').split(' ');
        for (const permission of ['allow-scripts', 'allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-downloads', 'allow-modals']) assert.ok(permissions.includes(permission));
        assert.ok(!permissions.includes('allow-same-origin'), 'Captured scripts must not gain access to the VS Code host');
        assert.ok(!permissions.includes('allow-top-navigation'));
        assert.equal(frame.referrerPolicy, 'no-referrer');
        assert.doesNotMatch(frame.srcdoc, /Content-Security-Policy|default-src 'none'/);
        for (const content of ['<script src="app.js">', 'window.injected=1', 'href="next.html"', 'onclick="window.clicked=1"', 'src="image.png"', 'action="submit"', '<template>', '正文😀']) assert.ok(frame.srcdoc.includes(content), content);
        assert.match(frame.srcdoc, /^<!DOCTYPE html>/i);
        assert.match(frame.srcdoc, /<base href="https:\/\/example.test\/pages\/document.html\?q=1">/);
        assert.equal(api.body.text, raw);
        assert.deepEqual(Array.from(api.body.bytes), Array.from(Buffer.from(raw)));
        api.setMode('text'); assert.equal(frame.isConnected, false); assert.equal(api.getText(), raw);
        api.setMode('preview');
        assert.equal(viewer.querySelector('iframe'), null, 'Returning to Preview requires another explicit click');
        start.click();
        assert.equal(viewer.querySelector('iframe'), null, 'A stale confirmation button must not start a new preview');
        viewer.querySelector('.body-html-start').click();
        assert.ok(viewer.querySelector('iframe'));
    }
    for (const source of sources) {
        openBody(ui, source);
        const api = ui.window.bodyViewers[source];
        assert.equal(api.getMode(), 'code');
        assert.equal(viewerFor(ui, source).querySelector('iframe'), null);
        checkGate(ui, viewerFor(ui, source), api);
        ui.click('.subscript[data-open-source="' + source + '"]', true); await Promise.all(ui.pending);
        const tab = await openDOM(t, host.panels.at(-1));
        assert.equal(tab.window.bodyViewer.getMode(), 'preview');
        assert.equal(tab.query('iframe'), null, 'Opening a standalone preview must not inherit authorization');
        assert.ok(tab.query('.body-html-start'));
        checkGate(tab, tab.query('#body-editor'), tab.window.bodyViewer);
    }
    ui.click('.request-items [index="1"]');
    for (const source of sources) {
        ui.window.bodyViewers[source].setMode('preview');
        assert.equal(viewerFor(ui, source).querySelector('iframe'), null, 'Selecting another request cannot inherit authorization');
    }
    assert.equal(JSON.stringify(ui.window.har.log.entries), captured);
});

test('HTML preview resolves recorded base URLs and preserves page-owned policies without touching source', async t => {
    const ui = await openDOM(t, createHost().main, [entry()]);
    const prepare = ui.window.HarBodyViewer.previewHTML;
    const raw = '<!DOCTYPE html><html><head><base href="../assets/"><meta http-equiv="Content-Security-Policy" content="script-src https://cdn.example.test"><meta http-equiv="refresh" content="5;url=next.html"></head><body><script>console.log("test")</script></body></html>';
    const result = prepare(raw, 'https://example.test/pages/document.html');
    assert.match(result, /<base href="https:\/\/example.test\/assets\/">/);
    assert.equal((result.match(/<base /g) || []).length, 1);
    assert.match(result, /Content-Security-Policy/);
    assert.match(result, /http-equiv="refresh"/);
    assert.match(result, /<script>/);
    for (const base of ['', undefined, 'invalid', 'file:///private/file.html']) assert.equal(prepare(raw, base), raw);
    const baseLess = '<p>fragment</p>';
    assert.ok(!prepare(baseLess, 'https://example.test/page').startsWith('<!DOCTYPE'), 'Do not change a recorded quirks-mode document to standards mode');
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
