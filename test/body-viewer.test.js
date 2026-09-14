const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');

test('real JSONEditor opens on double click, folds nodes and follows the selected request', async t => {
	const host = createHost();
	const entries = [entry(), entry('{"otherRequest":3}', '{"otherResponse":4}')];
	const ui = await openDOM(t, host.main, entries);
	ui.click('.request-items [index="0"]');
	assert.equal(ui.query('.main-layout').classList.contains('has-inspector'), false);
	ui.click('.request-items [index="0"]', true);
	for (const source of ['request', 'response']) {
		const viewer = ui.query('[data-json-source="' + source + '"]');
		assert.equal(viewer.hidden, false);
		assert.ok(viewer.querySelector('.jsoneditor-mode-tree'));
		const fallback = viewer.parentElement.querySelector('.code-block');
		assert.equal(ui.window.getComputedStyle(fallback).display, 'none', source + ' must not also show the old text box');
		const fields = viewer.querySelectorAll('.jsoneditor-field').length;
		viewer.querySelector('.jsoneditor-collapse-all').click();
		assert.ok(viewer.querySelectorAll('.jsoneditor-field').length < fields);
		viewer.querySelector('.jsoneditor-expand-all').click();
		assert.ok(viewer.querySelectorAll('.jsoneditor-field').length >= fields);
		assert.ok(viewer.querySelector('.jsoneditor-number'), 'values have syntax-highlighting classes');
	}
	ui.click('.request-items [index="1"]');
	assert.deepEqual(JSON.parse(ui.window.jsonEditors.request.getText()), { otherRequest: 3 });
	assert.deepEqual(JSON.parse(ui.window.jsonEditors.response.getText()), { otherResponse: 4 });
	assert.equal(ui.window.document.querySelectorAll('.json-body-viewer > .jsoneditor').length, 2);
	ui.click('.inspector-close');
	assert.equal(ui.window.document.querySelectorAll('.json-body-viewer .jsoneditor').length, 0);
	ui.click('.request-items [index="0"]');
	assert.equal(ui.query('.main-layout').classList.contains('has-inspector'), false);
});

test('JSON/text MIME variants, invalid JSON, and long bodies use the appropriate read-only control', async t => {
	const long = '{"secret":"<tag>&keep","nested":{"items":[1,true,null]},"tail":"' + 'x'.repeat(5100) + 'END"}';
	for (const mime of ['application/json; charset=utf-8', 'Application/Problem+JSON', 'text/json', 'text/plain', '']) {
		const ui = await openDOM(t, createHost().main, [entry(long, long, mime)]);
		ui.click('.request-items [index="0"]', true);
		for (const source of ['request', 'response']) {
			const editor = ui.window.jsonEditors[source];
			assert.equal(editor.getMode(), 'tree', mime);
			assert.equal(editor.get().tail.endsWith('END'), true);
			editor.setMode('text');
			assert.equal(editor.textarea.readOnly, true);
			assert.equal(editor.getText(), long);
			editor.setMode('tree');
			assert.equal(editor.options.onEditable({}), false);
		}
		assert.equal(ui.window.reqs[0].obj.response.content.text, long);
	}
	for (const [text, mime] of [['hello\nworld', 'text/plain'], ['{"broken":', 'application/json'], ['<x>content</x>', 'application/xml']]) {
		const ui = await openDOM(t, createHost().main, [entry(text, text, mime)]);
		ui.click('.request-items [index="0"]', true);
		for (const source of ['request', 'response']) {
			assert.equal(ui.window.jsonEditors[source].getMode(), 'text');
			assert.equal(ui.window.jsonEditors[source].textarea.readOnly, true);
			assert.equal(ui.window.jsonEditors[source].getText(), text);
		}
	}
});

test('each new body tab loads the same real JSONEditor, including JSON recorded as plain text', async t => {
	const host = createHost();
	const request = '{"request":"</script><script>window.injected=1</script>"}';
	const response = '{"response":{"nested":[2,3]}}';
	const ui = await openDOM(t, host.main, [entry(request, response, 'text/plain')]);
	ui.click('.request-items [index="0"]', true);
	for (const source of ['request', 'response']) {
		const viewer = ui.query('[data-json-source="' + source + '"]');
		viewer.dispatchEvent(new ui.window.MouseEvent('dblclick', { bubbles: true }));
		assert.equal(ui.messages.length, source === 'request' ? 0 : 1, 'tree interaction must not accidentally open another tab');
		ui.click('.subscript[data-open-source="' + source + '"]', true);
		await Promise.all(ui.pending);
		const tab = await openDOM(t, host.panels.at(-1));
		assert.ok(tab.query('#body-editor > .jsoneditor-mode-tree'));
		tab.click('.jsoneditor-collapse-all');
		tab.click('.jsoneditor-expand-all');
		assert.equal(tab.window.injected, undefined, 'body strings must not execute as HTML');
		assert.ok(tab.query('#body-editor').textContent.includes(source));
	}
});

test('plain text and invalid JSON also open safely in a read-only JSONEditor text tab', async t => {
	for (const [text, mime] of [['hello\n<&world', 'text/plain'], ['{"unfinished":', 'application/json']]) {
		const host = createHost();
		await host.main.webview.handler({ action: 'openNewTab', source: 'request', text, mimeType: mime });
		const tab = await openDOM(t, host.panels.at(-1));
		const area = tab.query('textarea.jsoneditor-text');
		assert.ok(area);
		assert.equal(area.value, text);
		assert.equal(area.readOnly, true);
	}
});

test('switching to image, media or binary never creates JSONEditor or exposes a text-tab action', async t => {
	for (const mime of ['image/png', 'image/svg+xml', 'video/mp4', 'audio/mpeg', 'application/octet-stream', 'application/pdf']) {
		const item = entry('{"looks":"json"}', '{"looks":"json"}', mime);
		if (mime === 'image/png') {
			item.response.content.text = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=';
			item.response.content.encoding = 'base64';
		}
		const ui = await openDOM(t, createHost().main, [entry(), item]);
		ui.click('.request-items [index="0"]', true);
		ui.click('.request-items [index="1"]');
		for (const source of ['request', 'response']) {
			assert.equal(ui.window.jsonEditors[source], null, mime);
			assert.equal(ui.query('[data-json-source="' + source + '"]').hidden, true);
			assert.equal(ui.query('.subscript[data-open-source="' + source + '"]').hidden, true);
		}
		if (mime.startsWith('image/')) {
			assert.notEqual(ui.window.getComputedStyle(ui.query('.img-preview')).display, 'none');
			assert.ok(ui.query('.img-preview').src.startsWith('data:' + mime));
		}
	}
});
