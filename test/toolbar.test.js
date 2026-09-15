const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const markup = fs.readFileSync(path.join(root, 'media/analyzer.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'media/script.js'), 'utf8');
const jquery = fs.readFileSync(path.join(root, 'media/jquery.min.js'), 'utf8');

function entry(options = {}) {
	return {
		request: {
			url: options.url || 'https://api.example.test/users',
			method: options.method || 'GET',
			httpVersion: options.version === undefined ? 'HTTP/1.1' : options.version,
			headers: options.requestHeaders || [],
			queryString: options.queryString || [],
			cookies: options.requestCookies || [],
			...(options.postData ? { postData: options.postData } : {})
		},
		response: {
			status: options.status === undefined ? 200 : options.status,
			statusText: 'OK',
			httpVersion: options.responseVersion || 'HTTP/1.1',
			headers: options.responseHeaders || [],
			cookies: options.responseCookies || [],
			content: {
				mimeType: options.mime === undefined ? 'text/plain' : options.mime,
				text: options.body || '',
				size: (options.body || '').length,
				...(options.encoding ? { encoding: options.encoding } : {})
			}
		},
		time: 1,
		timings: {},
		...(options.app ? { _app: options.app } : {}),
		...(options.resourceType ? { _resourceType: options.resourceType } : {})
	};
}

async function createToolbar(t, entries) {
	const dom = new JSDOM(`<!doctype html><html><body>${markup}</body></html>`, {
		runScripts: 'outside-only',
		pretendToBeVisual: true,
		url: 'https://har.test/'
	});
	t.after(() => dom.window.close());
	const { window } = dom;
	const errors = [];
	window.addEventListener('error', event => errors.push(event.error));
	window.acquireVsCodeApi = () => ({ postMessage() {} });
	window.TextDecoder = TextDecoder;
	window.TextEncoder = TextEncoder;
	window.Range.prototype.getClientRects = () => [];
	window.Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
	window.HTMLElement.prototype.scrollIntoView = function () {};
	window.harSource = 'https://har.test/fixture.har';
	window.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ log: { entries } }) });
	window.eval(jquery);
	window.eval(fs.readFileSync(path.join(root, 'media/body-viewer.bundle.js'), 'utf8'));
	window.eval(script);
	const loaded = new Promise((resolve, reject) => {
		const load = window.loadHAR;
		window.loadHAR = text => {
			try { load(text); resolve(); } catch (error) { reject(error); }
		};
	});
	// Exercise the same initial setup + asynchronous HAR load as the webview.
	for (const inline of window.document.querySelectorAll('script:not([src])')) window.eval(inline.textContent);
	await loaded;
	t.after(() => assert.deepEqual(errors, [], 'toolbar events must not throw'));
	const $ = window.$;
	return {
		window,
		click(value) { $(`.quick-filter[data-filter='${value}']`).trigger('click'); },
		select(selector, value) { $(selector).val(value).trigger('change'); },
		search(query, field = 'all', mode = 'contains') {
			$('.search-field').val(field).trigger('change');
			$('.search-mode').val(mode).trigger('change');
			$('.search').val(query).trigger('input');
		},
		visible() {
			const rows = [...window.document.querySelectorAll('.request-items .request-item')]
				.filter(row => row.style.display !== 'none').map(row => Number(row.getAttribute('index')));
			assert.deepEqual(Array.from(window.visibleIndicies), rows);
			return rows;
		},
		key(selector, key) {
			const event = new window.KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true });
			window.document.querySelector(selector).dispatchEvent(event);
			return event;
		}
	};
}

const quickCases = [
	['http', { url: 'http://api.example.test/' }],
	['https', { url: 'https://api.example.test/' }],
	['websocket', { url: 'wss://api.example.test/socket' }],
	['http1', { version: 'HTTP/1.1' }],
	['http2', { version: 'HTTP/2.0' }],
	...['POST', 'GET', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'].map(method => [method, { method }]),
	['other', { method: 'PROPFIND' }],
	['json', { mime: 'application/problem+json' }],
	['xml', { mime: 'application/soap+xml' }],
	['text', { mime: 'text/plain; charset=UTF-8' }],
	['html', { mime: 'application/xhtml+xml' }],
	['javascript', { mime: 'text/javascript' }],
	['image', { mime: 'image/png' }],
	['media', { mime: 'video/mp4' }],
	['binary', { mime: 'application/octet-stream' }],
	...[100, 204, 302, 404, 503].map(status => [`${Math.floor(status / 100)}xx`, { status }])
];

test('the interaction cases cover every toolbar quick-filter button', async t => {
	const ui = await createToolbar(t, []);
	const filters = [...ui.window.document.querySelectorAll('.quick-filter')].map(button => button.dataset.filter).sort();
	assert.deepEqual(filters, ['all', ...quickCases.map(([filter]) => filter)].sort());
});

for (const [filter, options] of quickCases) {
	test(`clicking ${filter} includes a matching request and toggles off`, async t => {
		const ui = await createToolbar(t, [entry(options)]);
		ui.click(filter);
		assert.deepEqual(ui.visible(), [0]);
		assert.equal(ui.window.$('.quick-filter[data-filter="all"]').hasClass('selected'), false);
		ui.click(filter);
		assert.deepEqual(ui.visible(), [0]);
		assert.equal(ui.window.$('.quick-filter[data-filter="all"]').hasClass('selected'), true);
	});
}

test('every quick filter excludes a non-matching request', async t => {
	const ui = await createToolbar(t, [entry({url:'ftp://example.test/', method:'PROPFIND', version:'HTTP/3', status:0, mime:'application/octet-stream'})]);
	for (const [filter] of quickCases) {
		ui.click(filter);
		assert.deepEqual(ui.visible(), ['other', 'binary'].includes(filter) ? [0] : [], filter);
		ui.click('all');
	}
});

test('same-group filters use OR and different groups use AND', async t => {
	const ui = await createToolbar(t, [
		entry({ method:'GET', mime:'application/json' }),
		entry({ method:'POST', mime:'application/json' }),
		entry({ method:'PUT', mime:'application/json' }),
		entry({ method:'GET', mime:'text/plain' }),
		entry({ method:'GET', mime:'application/json', status:404 })
	]);
	ui.click('GET');
	ui.click('POST');
	assert.deepEqual(ui.visible(), [0,1,3,4]);
	ui.click('json');
	assert.deepEqual(ui.visible(), [0,1,4]);
	ui.click('2xx');
	assert.deepEqual(ui.visible(), [0,1]);
	ui.click('POST');
	assert.deepEqual(ui.visible(), [0]);
	ui.click('all');
	assert.deepEqual(ui.visible(), [0,1,2,3,4]);
});

test('domain, application, search, quick filters and resets compose', async t => {
	const ui = await createToolbar(t, [
		entry({app:{id:'app.a',name:'App A'}}),
		entry({app:{id:'app.b',name:'App B'}}),
		entry({app:{id:'app.a',name:'App A'},url:'https://other.test/'}),
		entry()
	]);
	ui.select('.domain-filter', 'api.example.test');
	assert.deepEqual(ui.visible(), [0,1,3]);
	ui.select('.application-filter', 'app.a');
	assert.deepEqual(ui.visible(), [0]);
	ui.click('GET');
	ui.search('does-not-exist');
	assert.deepEqual(ui.visible(), []);
	ui.window.$('.clear-search').trigger('click');
	assert.deepEqual(ui.visible(), [0]);
	ui.click('all');
	assert.deepEqual(ui.visible(), [0], 'All resets only quick filters');
	ui.select('.application-filter', '__none__');
	assert.deepEqual(ui.visible(), [3]);
	ui.select('.domain-filter', '');
	ui.select('.application-filter', '');
	assert.deepEqual(ui.visible(), [0,1,2,3]);
});

for (const url of ['https://API.EXAMPLE.test/path', 'https://api.example.test:443/path', 'https://api.example.test?query=1', 'https://user:pass@api.example.test/path', 'https://例子.测试/path']) {
	test(`domain dropdown matches normalized host: ${url}`, async t => {
		const ui = await createToolbar(t, [entry({url})]);
		ui.select('.domain-filter', new URL(url).host);
		assert.deepEqual(ui.visible(), [0]);
	});
}

test('application ID __proto__ can be selected', async t => {
	const ui = await createToolbar(t, [entry({app:{id:'__proto__',name:'Special App'}}), entry()]);
	assert.equal(ui.window.$('.application-filter option').toArray().some(option=>option.value==='__proto__'), true);
	ui.select('.application-filter', '__proto__');
	assert.deepEqual(ui.visible(), [0]);
});

test('SVG is an image, while XHTML and XML retain their own groups', async t => {
	const ui = await createToolbar(t, [entry({mime:'image/svg+xml'}),entry({mime:'application/xhtml+xml'}),entry({mime:'text/xml'})]);
	ui.click('image');
	assert.deepEqual(ui.visible(), [0]);
	ui.click('all'); ui.click('html');
	assert.deepEqual(ui.visible(), [1]);
	ui.click('all'); ui.click('xml');
	assert.deepEqual(ui.visible(), [2]);
});

test('HTTPS WebSocket handshakes and ws/wss URLs match WebSocket', async t => {
	const ui = await createToolbar(t, [
		entry({url:'wss://socket.test/'}), entry({url:'ws://socket.test/'}),
		entry({resourceType:'websocket'}),
		entry({status:101,responseHeaders:[{name:'Upgrade',value:'websocket'}]}), entry()
	]);
	ui.click('websocket');
	assert.deepEqual(ui.visible(), [0,1,2,3]);
});

test('HTTP version falls back to the recorded response version', async t => {
	const ui = await createToolbar(t, [entry({version:'',responseVersion:'HTTP/2'})]);
	ui.click('http2');
	assert.deepEqual(ui.visible(), [0]);
});

test('HTTP version aliases, lowercase methods and content-type variants', async t => {
	const variants = [
		['http1', {version:'h1'}], ['http1', {version:'1.0'}],
		['http2', {version:'h2'}], ['http2', {version:'  HTTP/2  '}],
		['GET', {method:'get'}], ['media', {mime:'audio/ogg'}],
		['javascript', {mime:'application/ecmascript'}], ['json', {mime:'Application/JSON; Charset=UTF-8'}]
	];
	const ui = await createToolbar(t, []);
	for (const [filter, options] of variants) {
		ui.click('all');
		ui.window.loadHAR(JSON.stringify({log:{entries:[entry(options)]}}));
		ui.click(filter);
		assert.deepEqual(ui.visible(),[0],JSON.stringify(options));
	}
});

test('status groups include both boundaries and exclude missing/non-HTTP status codes', async t => {
	const statuses = [0, 99, 100, 199, 200, 299, 300, 399, 400, 499, 500, 599, 600];
	const ui = await createToolbar(t, statuses.map(status => entry({status})));
	for (let group = 1; group <= 5; group++) {
		ui.click('all'); ui.click(`${group}xx`);
		assert.deepEqual(ui.visible(), [group * 2, group * 2 + 1]);
	}
});

test('URL contains, starts-with, equals, case insensitivity and empty search', async t => {
	const ui = await createToolbar(t, [entry(),entry({url:'https://other.test/'})]);
	for (const [query, mode, expected] of [
		['EXAMPLE','contains',[0]], ['https://api.','startsWith',[0]],
		['example','startsWith',[]], ['HTTPS://API.EXAMPLE.TEST/USERS','equals',[0]],
		['users','equals',[]], ['', 'equals',[0,1]]
	]) {
		ui.search(query,'url',mode);
		assert.deepEqual(ui.visible(), expected, `${mode}: ${query}`);
	}
});

test('all/request/response search include headers, bodies and status without leaking scope', async t => {
	const ui = await createToolbar(t, [entry({
		requestHeaders:[{name:'X-Request-Token',value:'request-header-needle'}],
		postData:{mimeType:'text/plain',text:'request-body-needle'},
		responseHeaders:[{name:'X-Response-Token',value:'response-header-needle'}],
		body:'response-body-needle'
	}), entry({url:'https://other.test/'})]);
	for (const [query, field, expected] of [
		['request-header-needle','all',[0]], ['request-body-needle','all',[0]], ['response-header-needle','all',[0]],
		['request-header-needle','request',[0]], ['request-body-needle','request',[0]],
		['response-header-needle','response',[0]], ['response-body-needle','response',[0]],
		['response-body-needle','request',[]], ['request-body-needle','response',[]]
	]) {
		ui.search(query,field);
		assert.deepEqual(ui.visible(),expected, `${field}: ${query}`);
	}
});

test('equals and starts-with match individual searchable values', async t => {
	const ui = await createToolbar(t, [entry({method:'POST',body:'response-value',postData:{text:'request-value'},requestHeaders:[{name:'X-Test',value:'header-value'}]})]);
	for (const [query, field, mode] of [
		['POST','all','equals'], ['request-value','request','equals'], ['header-value','request','equals'],
		['response-value','response','equals'], ['request-','request','startsWith'], ['response-','response','startsWith']
	]) {
		ui.search(query,field,mode);
		assert.deepEqual(ui.visible(),[0], `${field}/${mode}: ${query}`);
	}
});

test('query parameters, form fields, uploads and cookies are searchable in their own scope', async t => {
	const ui = await createToolbar(t, [entry({
		queryString:[{name:'filter',value:'query-needle'}],
		postData:{mimeType:'multipart/form-data',params:[{name:'field',value:'form-needle'},{name:'upload',fileName:'report.csv',contentType:'text/csv'}]},
		requestCookies:[{name:'requestCookie',value:'request-cookie-needle'}],
		responseCookies:[{name:'responseCookie',value:'response-cookie-needle'}]
	})]);
	for (const [field, queries] of [
		['request',['query-needle','form-needle','report.csv','multipart/form-data','request-cookie-needle']],
		['response',['response-cookie-needle']]
	]) {
		for (const query of queries) {
			ui.search(query,field,'equals');
			assert.deepEqual(ui.visible(),[0],query);
			ui.search(query,'all');
			assert.deepEqual(ui.visible(),[0],query);
		}
	}
});

test('search covers response content beyond the preview limit', async t => {
	const ui = await createToolbar(t, [entry({body:'x'.repeat(6000)+'tail-needle'})]);
	for (const field of ['all','response']) {
		ui.search('tail-needle',field);
		assert.deepEqual(ui.visible(),[0]);
	}
});

test('base64 UTF-8 response text is searchable', async t => {
	const ui = await createToolbar(t, [entry({body:Buffer.from('你好世界').toString('base64'),encoding:'base64',mime:'text/plain; charset=utf-8'})]);
	ui.search('你好','response');
	assert.deepEqual(ui.visible(),[0]);
});

test('missing content mimeType uses the Content-Type header', async t => {
	const ui = await createToolbar(t, [entry({mime:'',responseHeaders:[{name:'Content-Type',value:'application/json; charset=utf-8'}],body:'{}'})]);
	ui.click('json');
	assert.deepEqual(ui.visible(),[0]);
});

test('arrow keys do not intercept toolbar selects or the search input', async t => {
	const ui = await createToolbar(t, [entry(),entry()]);
	for (const selector of ['.domain-filter','.application-filter','.search-field','.search-mode','.search']) {
		const event = ui.key(selector,'ArrowDown');
		assert.equal(event.defaultPrevented,false,selector);
		assert.equal(ui.window.selectedIndex,-1,selector);
	}
});

test('keyboard navigation starts on visible rows and handles no matches', async t => {
	const ui = await createToolbar(t, [entry(),entry({method:'POST'}),entry()]);
	ui.click('POST');
	ui.key('body','ArrowDown');
	assert.equal(ui.window.selectedIndex,1);
	ui.window.closeInspector();
	ui.key('body','ArrowUp');
	assert.equal(ui.window.selectedIndex,1);
	ui.search('no-matches');
	assert.equal(ui.window.selectedIndex,-1,'hide the inspector if its row is filtered out');
	ui.key('body','ArrowDown');
	assert.equal(ui.window.selectedIndex,-1);
});

test('empty HAR and repeated loading preserve valid filtering without duplicate listeners', async t => {
	const ui = await createToolbar(t, []);
	ui.click('GET');
	assert.deepEqual(ui.visible(),[]);
	ui.window.loadHAR(JSON.stringify({log:{entries:[entry(),entry(),entry()]}}));
	assert.deepEqual(ui.visible(),[0,1,2]);
	ui.key('body','ArrowDown');
	assert.equal(ui.window.selectedIndex,0,'a single key press selects only one row');
	ui.key('body','ArrowDown');
	assert.equal(ui.window.selectedIndex,1,'subsequent key presses are not swallowed by a timer');
});
