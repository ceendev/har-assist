const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.resolve(__dirname, '..', 'media/script.js'), 'utf8');

function createJQueryStub() {
	const chain = {
		addClass() { return chain; },
		append() { return chain; },
		appendTo() { return chain; },
		attr() { return chain; },
		clone() { return chain; },
		empty() { return chain; },
		first() { return chain; },
		find() { return chain; },
		hide() { return chain; },
		ready() { return chain; },
		show() { return chain; },
		text() { return chain; },
		val() { return ''; },
		on() { return chain; },
		off() { return chain; },
		toggleClass() { return chain; }
	};
	return selector => {
		if (selector === undefined) return chain;
		return chain;
	};
}

function loadScript(consoleApi = console) {
	const context = {
		acquireVsCodeApi() { return { postMessage() {} }; },
		atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
		console: consoleApi,
		TextEncoder,
		document: {},
		fetch() { throw new Error('fetch should not run in this unit test'); },
		window: {
			addEventListener() {}
		},
		$: createJQueryStub(),
		setTimeout
	};
	vm.createContext(context);
	vm.runInContext(script, context);
	return context;
}

const context = loadScript();
const responseText = 'connection established';

assert.doesNotThrow(() => {
	context.addRequestItem({
		request: {
			method: 'CONNECT',
			url: 'https://mtalk.google.com:5228',
			headers: []
		},
		response: {
			status: 200,
			statusText: 'OK',
			content: {
				size: responseText.length,
				text: responseText
			}
		},
		time: 0
	});
}, 'HAR entries with response text but no mimeType should remain readable');

assert.strictEqual(context.reqs.length, 1);
assert.strictEqual(context.reqs[0].mimeType, 'text/plain');
assert.strictEqual(context.reqs[0].content, responseText);

const consoleCalls = [];
const quietContext = loadScript({
	log(...values) { consoleCalls.push(values); },
	error() {}
});
const invalidJson = '{"incomplete":';

assert.strictEqual(quietContext.formatJSON(invalidJson), invalidJson);
assert.deepStrictEqual(consoleCalls, [], 'invalid JSON response bodies should not be copied to the console');
