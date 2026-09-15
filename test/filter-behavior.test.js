const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const script = fs.readFileSync(path.resolve(__dirname, '..', 'media/script.js'), 'utf8');
const markup = fs.readFileSync(path.resolve(__dirname, '..', 'media/analyzer.html'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '..', 'media/style.css'), 'utf8');

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
		hasClass() { return false; },
		hide() { return chain; },
		ready() { return chain; },
		removeClass() { return chain; },
		show() { return chain; },
		text() { return chain; },
		val() { return ''; },
		on() { return chain; },
		off() { return chain; },
		toggleClass() { return chain; }
	};
	return () => chain;
}

const context = {
	TextEncoder,
	acquireVsCodeApi() { return { postMessage() {} }; },
	atob(value) { return Buffer.from(value, 'base64').toString('binary'); },
	console,
	document: {},
	fetch() { throw new Error('fetch should not run in this unit test'); },
	window: { addEventListener() {} },
	URL,
	$: createJQueryStub(),
	setTimeout
};
vm.createContext(context);
vm.runInContext(script, context);

assert.strictEqual(context.getProtocolGroup('http://example.test/path'), 'http');
assert.strictEqual(context.getProtocolGroup('wss://example.test/socket'), 'websocket');
assert.strictEqual(context.getHttpVersionGroup({ request: { httpVersion: 'HTTP/2' } }), 'http2');
assert.strictEqual(context.getHttpVersionGroup({ request: { httpVersion: 'HTTP/1.1' } }), 'http1');
assert.strictEqual(context.getMethodGroup('GET'), 'GET');
assert.strictEqual(context.getMethodGroup('POST'), 'POST');
assert.strictEqual(context.getMethodGroup('PUT'), 'PUT');
assert.strictEqual(context.getMethodGroup('DELETE'), 'DELETE');
assert.strictEqual(context.getMethodGroup('PATCH'), 'PATCH');
assert.strictEqual(context.getMethodGroup('HEAD'), 'HEAD');
assert.strictEqual(context.getMethodGroup('OPTIONS'), 'OPTIONS');
assert.strictEqual(context.getMethodGroup('CONNECT'), 'CONNECT');
assert.strictEqual(context.getMethodGroup('TRACE'), 'TRACE');
assert.strictEqual(context.getMethodGroup('PROPFIND'), 'other');
assert.strictEqual(context.getStatusGroup(404), '4xx');
assert.strictEqual(context.getContentGroup('application/problem+json'), 'json');
assert.strictEqual(context.getContentGroup('image/png'), 'image');
assert.strictEqual(context.getContentGroup('video/mp4'), 'media');
assert.strictEqual(context.getContentGroup('text/plain'), 'text');

const application = context.getApplicationInfo({ _app: { id: 'com.example.app', name: 'Example' } });
assert.strictEqual(application.key, 'com.example.app');
assert.strictEqual(application.label, 'Example');
const unlabeledApplication = context.getApplicationInfo({});
assert.strictEqual(unlabeledApplication.key, '__none__');
assert.strictEqual(unlabeledApplication.label, '未标注');

assert.strictEqual(context.matchesSearchText('api.example.test/users', 'example', 'contains'), true);
assert.strictEqual(context.matchesSearchText('api.example.test/users', 'example', 'startsWith'), false);
assert.strictEqual(context.matchesSearchText('api.example.test/users', 'api.', 'startsWith'), true);
assert.strictEqual(context.matchesFilterGroups({ protocol: 'https', content: 'json' }, {
	protocol: ['http', 'https'],
	content: ['json']
}), true);
assert.strictEqual(context.matchesFilterGroups({ protocol: 'https', content: 'xml' }, {
	protocol: ['http', 'https'],
	content: ['json']
}), false);
assert.strictEqual(context.clampInspectorWidth(100, 1200), 280);
assert.strictEqual(context.clampInspectorWidth(700, 1200), 700);
assert.strictEqual(context.clampInspectorWidth(1100, 1200), 920);
assert.deepStrictEqual(Array.from(context.resizeAdjacentColumns([100, 200, 300], 0, 40, [60, 80, 100])), [140, 160, 300]);
assert.deepStrictEqual(Array.from(context.resizeAdjacentColumns([100, 200, 300], 0, 180, [60, 80, 100])), [220, 80, 300]);
assert.deepStrictEqual(Array.from(context.resizeAdjacentColumns([100, 200, 300], 1, -180, [60, 80, 100])), [100, 80, 420]);
assert.strictEqual(context.clampInspectorTableKeyWidth(40, 500), 80);
assert.strictEqual(context.clampInspectorTableKeyWidth(220, 500), 220);
assert.strictEqual(context.clampInspectorTableKeyWidth(480, 500), 400);
assert.strictEqual(context.getDisplayRequestId({ index: 0 }), '1');
assert.strictEqual(context.getDisplayRequestId({ index: 41 }), '42');
assert.match(context.formatRawRequest({ request: { method: 'GET', url: 'https://example.test/path?a=1', httpVersion: 'HTTP/2', headers: [{ name: 'Host', value: 'example.test' }] } }), /^GET \/path\?a=1 HTTP\/2/m);
assert.match(context.formatRawResponse({ request: { httpVersion: 'HTTP/2' }, response: { status: 200, statusText: 'OK', headers: [] } }, 'body'), /^HTTP\/2 200 OK/m);
assert.match(context.formatRawResponse({ request: { httpVersion: 'HTTP/1.1' }, response: { httpVersion: 'HTTP/2', status: 200, statusText: 'OK', headers: [] } }, 'body'), /^HTTP\/2 200 OK/m);
let panelState = context.toggleInspectorPanelState({ requestExpanded: true, responseExpanded: true }, 'request');
assert.strictEqual(panelState.requestExpanded, false);
assert.strictEqual(panelState.responseExpanded, true);
panelState = context.toggleInspectorPanelState(panelState, 'response');
assert.strictEqual(panelState.requestExpanded, true);
assert.strictEqual(panelState.responseExpanded, false);
panelState = context.toggleInspectorPanelState(panelState, 'response');
assert.strictEqual(panelState.requestExpanded, true);
assert.strictEqual(panelState.responseExpanded, true);

assert.ok(markup.indexOf('class="toolbar-controls"') < markup.indexOf('class="quick-filters"'));
assert.ok(markup.includes('class="request-list-header"'));
assert.ok(markup.includes('class="request-column-resizer"'));
assert.match(markup, /role="columnheader">ID</);
assert.match(markup, /role="columnheader">应用程序</);
assert.ok(markup.includes('class="request-id"'));
assert.match(markup, /data-panel="request"[\s\S]*?codicon-chevron-up/);
assert.match(markup, /data-panel="response"[\s\S]*?codicon-chevron-down/);
assert.ok(markup.includes('class="application"'));
assert.ok(markup.includes('class="request-url"'));
assert.ok(markup.includes('data-panel="request"'));
assert.ok(markup.includes('data-panel="response"'));
assert.ok(markup.includes('class="inspector-horizontal-splitter"'));
assert.ok(markup.includes('class="inspector-panel-url" data="fullURL"'));
assert.ok(markup.indexOf('class="inspector-panel-url"') < markup.indexOf('class="inspector-panels"'));
assert.ok(markup.includes('aria-label="请求 URL，可水平拖动查看完整内容"'));
assert.ok(markup.includes('class="inspector-copy"'));
assert.ok(markup.includes('codicon codicon-copy'));
assert.ok(!markup.includes('class="inspector-label"'));
assert.ok(markup.includes('class="har-raw-viewer body-viewer"'));
assert.ok(markup.includes('data-raw-source="request"'));
assert.ok(markup.includes('data-raw-source="response"'));
assert.ok(!markup.includes('raw-view-tab'));
assert.ok(markup.includes('name="请求头"'));
assert.ok(markup.includes('name="响应头"'));
assert.ok(markup.includes('name="原始"'));
assert.ok(markup.includes('class="inspector-section"'));
assert.ok(!markup.includes('class="section"'));
assert.ok(!markup.includes('class="section-title"'));
assert.ok(!markup.includes('inspector-section-title'));
assert.match(script, /function setupRequestColumnResizers\(\)/);
assert.match(script, /function setupDataTableColumnResizers\(\)/);
assert.match(script, /function setupInspectorURLScroller\(\)/);
assert.match(script, /scroller\.scrollLeft = startScrollLeft - delta/);
assert.match(script, /event\.key == "End"/);
assert.match(script, /action: "copyRequestUrl"/);
assert.match(script, /copyButton\.addEventListener\("click"/);
assert.doesNotMatch(script, /scroller\.addEventListener\("dblclick"/);
assert.match(script, /function showInspectorCopyResult\(success\)/);
assert.match(script, /icon\.classList\.add\("codicon-check"\)/);
assert.match(script, /function showCopyToastAt\(clientX, clientY, success\)/);
assert.match(script, /message\.command === 'copyRequestUrlResult'/);
assert.match(script, /\(expanded \? "收缩" : "展开"\)/);
assert.match(styles, /--inspector-key-width:/);
assert.match(styles, /\.data-table-column-resizer/);
assert.match(styles, /\.inspector-panel-url\s*\{[\s\S]*?overflow-x:\s*auto;[\s\S]*?cursor:\s*grab;/);
assert.match(styles, /\.copy-toast\s*\{[\s\S]*?position:\s*fixed;/);
assert.match(styles, /\.inspector-bar:hover \.inspector-copy/);
assert.match(styles, /\.inspector-copy\.copied/);
assert.ok(markup.includes('data-filter="DELETE">DELETE</button>'));
assert.ok(markup.includes('data-filter="PATCH">PATCH</button>'));
assert.ok(markup.includes('data-filter="HEAD">HEAD</button>'));
assert.ok(markup.includes('data-filter="OPTIONS">OPTIONS</button>'));
assert.ok(markup.includes('data-filter="CONNECT">CONNECT</button>'));
assert.ok(markup.includes('data-filter="TRACE">TRACE</button>'));
assert.ok(markup.includes('data-filter="other">其他</button>'));
assert.ok(!markup.includes('>XX</button>'));
assert.match(styles, /\.search-box\s*\{[\s\S]*?overflow:\s*hidden;/);
assert.match(styles, /\.search-box input\.search\s*\{[\s\S]*?background:\s*transparent;/);
