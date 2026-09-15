const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
// Package checks run this same suite against the extracted VSIX, never falling
// back to source-tree resources that a user would not have after installation.
const root = process.env.HAR_ASSIST_TEST_ROOT || path.resolve(__dirname, '../..');
const requireExtension = createRequire(path.join(root, 'extension.js'));

function entry(requestText = '{"request":{"value":1}}', responseText = '{"response":{"value":2}}', mimeType = 'application/json') {
	return {
		request: { url: 'https://example.test/api', method: 'POST', httpVersion: 'HTTP/1.1', headers: [], cookies: [], queryString: [], postData: { mimeType, text: requestText } },
		response: { status: 200, statusText: 'OK', headers: [], cookies: [], content: { mimeType, text: responseText, size: responseText.length } },
		timings: {}, time: 1
	};
}

// Only host/layout/media APIs unavailable in jsdom are replaced; runtime assets
// (including CodeMirror) are the real shipped resources.
function createHost() {
	const panels = [];
	const copiedTexts = [];
	const uri = fsPath => ({ fsPath, toString: () => 'https://har.test/' + path.relative(root, fsPath).split(path.sep).join('/') });
	const newPanel = () => {
		const panel = { webview: { asWebviewUri: value => value, onDidReceiveMessage(handler) { this.handler = handler; }, postMessage: async () => true } };
		panels.push(panel);
		return panel;
	};
	const vscode = {
		env: { clipboard: { writeText: async text => { copiedTexts.push(text); } } },
		ViewColumn: { Beside: 2 },
		Uri: { joinPath: (base, ...parts) => uri(path.resolve(base.fsPath, ...parts)) },
		window: { createWebviewPanel(type, title, column, options) { const panel = newPanel(); panel.webview.options = options; return panel; } },
		workspace: { openTextDocument() { throw new Error('Bodies must open in a content WebView'); } }
	};
	const module = { exports: {} };
	vm.runInNewContext(fs.readFileSync(path.join(root, 'extension.js'), 'utf8'), {
		module, require: id => id === 'vscode' ? vscode : requireExtension(id)
	});
	const main = newPanel();
	module.exports.renderHarEditor(main, module.exports.createHarDocument(uri(path.join(root, 'fixture.har'))), {
		extensionUri: uri(root), subscriptions: [], markup: fs.readFileSync(path.join(root, 'media/analyzer.html'), 'utf8')
	});
	return { main, panels, copiedTexts };
}

async function openDOM(t, panel, entries = []) {
	const errors = [];
	const console = new VirtualConsole();
	console.on('jsdomError', error => errors.push(error.message));
	class LocalResources extends ResourceLoader {
		fetch(url) {
			const parsed = new URL(url);
			if (parsed.origin !== 'https://har.test') throw new Error('Unexpected remote resource: ' + parsed.origin);
			return Promise.resolve(fs.readFileSync(path.join(root, decodeURIComponent(parsed.pathname))));
		}
	}
	const messages = [];
	const pending = [];
	const dom = new JSDOM(panel.webview.html, {
		runScripts: 'dangerously', resources: new LocalResources(), pretendToBeVisual: true,
		url: 'https://har.test/', virtualConsole: console,
		beforeParse(window) {
			window.acquireVsCodeApi = () => ({ postMessage(message) { messages.push(message); pending.push(panel.webview.handler(message)); } });
			window.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ log: { entries } }) });
			window.TextDecoder = TextDecoder;
			window.TextEncoder = TextEncoder;
			window.Range.prototype.getClientRects = () => [];
			window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
			window.HTMLMediaElement.prototype.pause = function () {};
			window.HTMLMediaElement.prototype.load = function () {};
			window.blobResources = new Map();
			let blobId = 0;
			window.URL.createObjectURL = blob => { const url = 'blob:https://har.test/' + ++blobId; window.blobResources.set(url, blob); return url; };
			window.URL.revokeObjectURL = url => window.blobResources.delete(url);
			window.HTMLElement.prototype.scrollIntoView = function () {};
		}
	});
	t.after(() => {
		if (dom.window.bodyViewers) dom.window.destroyBodyEditors();
		dom.window.dispatchEvent(new dom.window.Event('pagehide'));
		dom.window.close();
		if (errors.length) throw new Error(errors.join('\n'));
	});
	await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
	// jQuery schedules its ready callback after the load event.
	await new Promise(resolve => setTimeout(resolve, 30));
	const { window } = dom;
	panel.webview.postMessage = async data => { window.dispatchEvent(new window.MessageEvent('message', { data })); return true; };
	return {
		window, messages, pending,
		query: selector => window.document.querySelector(selector),
		click(selector, double = false) {
			const target = window.document.querySelector(selector);
			if (!target) throw new Error('Missing control: ' + selector);
			target.dispatchEvent(new window.MouseEvent(double ? 'dblclick' : 'click', { bubbles: true }));
		}
	};
}

module.exports = { entry, createHost, openDOM };
