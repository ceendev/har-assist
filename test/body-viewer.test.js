const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');

test('JSONEditor opens formatted code without menu or status bars, folds code and follows selection', async t => {
	const host = createHost();
	const entries = [entry(), entry('{"otherRequest":3}', '{"otherResponse":4}')];
	const ui = await openDOM(t, host.main, entries);
	ui.click('.request-items [index="0"]');
	assert.equal(ui.query('.main-layout').classList.contains('has-inspector'), false);
	ui.click('.request-items [index="0"]', true);
	for (const source of ['request', 'response']) {
		const viewer = ui.query('[data-json-source="' + source + '"]');
		assert.equal(viewer.hidden, false);
		assert.ok(viewer.querySelector('.jsoneditor-mode-code'));
		assert.equal(viewer.querySelector('.jsoneditor-menu'), null);
		assert.equal(viewer.querySelector('.jsoneditor-navigation-bar'), null);
		assert.equal(viewer.querySelector('.jsoneditor-statusbar'), null);
		assert.ok(viewer.closest('.page').classList.contains('text-body'));
		assert.equal(ui.window.getComputedStyle(viewer.parentElement).display, 'flex');
		assert.equal(ui.window.getComputedStyle(viewer.closest('.page')).overflow, 'hidden');
		const fallback = viewer.parentElement.querySelector('.code-block');
		assert.equal(ui.window.getComputedStyle(fallback).display, 'none', source + ' must not also show the old text box');
		const editor = ui.window.jsonEditors[source];
		assert.equal(editor.aceEditor.getReadOnly(), true);
		const session = editor.aceEditor.getSession();
		assert.ok(session.getLength() > 1, 'JSON must be auto-formatted on opening');
		assert.equal(session.getFoldWidget(0), 'start');
		session.foldAll();
		assert.ok(session.getAllFolds().length > 0);
		session.unfold();
		assert.equal(session.getAllFolds().length, 0);
		assert.ok(session.getTokens(2).some(token => token.type.includes('numeric')), 'JSON has syntax highlighting');
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
			assert.equal(editor.getMode(), 'code', mime);
			assert.equal(editor.getText(), JSON.stringify(JSON.parse(long), null, 2));
			assert.equal(editor.get().tail.endsWith('END'), true);
			editor.setMode('text');
			assert.equal(editor.textarea.readOnly, true);
			assert.equal(editor.getText(), long);
			editor.setMode('code');
			assert.equal(editor.getText(), JSON.stringify(JSON.parse(long), null, 2));
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
		assert.equal(ui.messages.length, source === 'request' ? 0 : 1, 'code interaction must not accidentally open another tab');
		ui.click('.subscript[data-open-source="' + source + '"]', true);
		await Promise.all(ui.pending);
		const tab = await openDOM(t, host.panels.at(-1));
		assert.ok(tab.query('#body-editor > .jsoneditor-mode-code'));
		assert.equal(tab.query('#body-editor .jsoneditor-menu'), null);
		assert.equal(tab.query('#body-editor .jsoneditor-statusbar'), null);
		const editor = tab.query('.ace_editor').env.editor;
		assert.equal(editor.getReadOnly(), true);
		assert.equal(editor.getValue(), JSON.stringify(JSON.parse(source === 'request' ? request : response), null, 2));
		editor.getSession().foldAll();
		assert.ok(editor.getSession().getAllFolds().length > 0);
		editor.getSession().unfold();
		assert.equal(tab.window.injected, undefined, 'body strings must not execute as HTML');
		assert.ok(editor.getValue().includes(source));
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
		assert.equal(tab.query('#body-editor .jsoneditor-statusbar'), null);
	}
});

test('XML, plain text and invalid JSON never show JSON parse errors in either inspector or new tabs', async t => {
	const cases = [
		['<?xml version="1.0" encoding="UTF-8"?><request protocol="3.0"><app status="ok"/></request>', 'application/xml'],
		['{"unfinished":', 'application/json'],
		['hello\n<&world', 'text/plain']
	];
	const host = createHost();
	const ui = await openDOM(t, host.main, cases.map(([text, mime]) => entry(text, text, mime)));
	ui.click('.request-items [index="0"]', true);
	for (const [index, [text, mime]] of cases.entries()) {
		ui.click('.request-items [index="' + index + '"]');
		for (const source of ['request', 'response']) {
			const editor = ui.window.jsonEditors[source];
			assert.equal(editor.getMode(), 'text', mime);
			// The library also validates asynchronously in text mode. Force that
			// pass; checking immediately after mount misses the red error table.
			await editor.validate();
			assert.equal(ui.query('[data-json-source="' + source + '"] .jsoneditor-text-errors'), null);
			assert.equal(editor.getText(), text, 'Do not repair, truncate or redact invalid JSON/text');
			ui.click('.subscript[data-open-source="' + source + '"]', true);
			await Promise.all(ui.pending);
			const tab = await openDOM(t, host.panels.at(-1));
			await new Promise(resolve => setTimeout(resolve, tab.window.JSONEditor.prototype.DEBOUNCE_INTERVAL + 50));
			assert.equal(tab.query('.jsoneditor-text-errors'), null);
			assert.equal(tab.query('textarea.jsoneditor-text').value, text);
			assert.equal(tab.query('textarea.jsoneditor-text').readOnly, true);
		}
	}
});

test('fitted body layout survives empty bodies and keeps the open-tab action outside scrolling content', async t => {
	const ui = await openDOM(t, createHost().main, [entry('', ''), entry(), entry('plain\n'.repeat(300), 'plain\n'.repeat(300), 'text/plain')]);
	ui.click('.request-items [index="0"]', true);
	for (const index of [1, 2]) {
		ui.click('.request-items [index="' + index + '"]');
		for (const source of ['request', 'response']) {
			const viewer = ui.query('[data-json-source="' + source + '"]');
			const section = viewer.parentElement;
			const action = section.querySelector('.open-new-tab');
			assert.equal(ui.window.getComputedStyle(section).display, 'flex');
			assert.equal(ui.window.getComputedStyle(viewer).minHeight, '0');
			assert.equal(ui.window.getComputedStyle(viewer).height, 'auto');
			assert.equal(ui.window.getComputedStyle(action).flexShrink, '0');
			assert.equal(action.hidden, false);
			assert.equal(viewer.contains(action), false);
			assert.equal(viewer.querySelector('.jsoneditor-statusbar'), null);
		}
	}
	// Even if the library fails, scroll only the fallback text, not the action.
	ui.window.JSONEditor = undefined;
	ui.click('.request-items [index="1"]');
	for (const source of ['request', 'response']) {
		const viewer = ui.query('[data-json-source="' + source + '"]');
		const section = viewer.parentElement;
		assert.equal(viewer.hidden, true);
		assert.equal(section.querySelector('.body-viewer-error').hidden, false);
		assert.equal(ui.window.getComputedStyle(section.querySelector('.code-block')).overflow, 'auto');
		assert.equal(section.querySelector('.open-new-tab').hidden, false);
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
			assert.equal(ui.query('[data-json-source="' + source + '"]').closest('.page').classList.contains('text-body'), false);
			assert.equal(ui.query('.subscript[data-open-source="' + source + '"]').hidden, true);
		}
		if (mime.startsWith('image/')) {
			assert.notEqual(ui.window.getComputedStyle(ui.query('.img-preview')).display, 'none');
			assert.ok(ui.query('.img-preview').src.startsWith('data:' + mime));
		}
	}
});
