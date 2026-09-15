const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');
const values = ui => Array.from(ui.query('.request-path-table').querySelectorAll('.data-row:not(.data-table-header)'), row => [row.querySelector('.data-key').textContent, row.querySelector('.data-value').textContent]);
const withURL = url => { const item = entry(); item.request.url = url; return item; };

test('request path tab sits between Raw and Headers and lists numbered path segments only', async t => {
    const urls = [
        ['https://example.test/api/v1/users?id=123#detail', ['api', 'v1', 'users']],
        ['https://user:pass@example.test:8443/a%2Fb/%E4%B8%AD?q=/ignored#fragment', ['a%2Fb', '%E4%B8%AD']],
        ['https://example.test/a//b/', ['a', '', 'b', '']],
        ['https://example.test/a/.././b', ['a', '..', '.', 'b']],
        ['wss://[2001:db8::1]:8443/socket/channel', ['socket', 'channel']],
        ['https://example.test/中😀/a+b/%ZZ', ['中😀', 'a+b', '%ZZ']],
        ['//example.test/api/v2', ['api', 'v2']],
        ['/relative/path?query=/ignored', ['relative', 'path']],
        ['https://example.test/', []], ['https://example.test?query=/ignored', []],
        ['https://example.test#fragment/path', []], ['example.test:443', []], ['', []]
    ];
    const items = urls.map(([url]) => withURL(url)), captured = JSON.stringify(items);
    const ui = await openDOM(t, createHost().main, items);
    const tabs = Array.from(ui.window.document.querySelectorAll('.request-panel .tab'), el => el.textContent);
    assert.deepEqual(tabs.slice(0, 4), ['总览', '原始', '请求路径', '请求头']);
    assert.equal(ui.query('.response-panel .tab[name="请求路径"]'), null);
    ui.click('.request-items [index="0"]', true);
    ui.click('.request-panel .tab[name="请求路径"]');
    for (const [index, [, segments]] of urls.entries()) {
        ui.click('.request-items [index="' + index + '"]');
        assert.equal(ui.query('.request-path').classList.contains('show'), true);
        assert.deepEqual(values(ui), segments.map((value, i) => [String(i + 1), value]));
        assert.deepEqual(Array.from(ui.query('.data-table-header').children, el => el.textContent), ['序号', '路径值']);
        assert.equal(ui.query('.request-path-table').querySelectorAll('.data-table-column-resizer').length, 1);
        assert.equal(ui.window.getComputedStyle(ui.query('.request-path-empty')).display === 'none', segments.length > 0);
    }
    assert.equal(JSON.stringify(ui.window.har.log.entries), captured);
});

test('request paths remain literal, complete and unredacted while switching tabs and requests', async t => {
    const segment = '<img src=x onerror="window.injected=1">&token=captured-secret-' + '中😀'.repeat(150);
    const items = [withURL('https://example.test/' + segment + '/last'), withURL('https://example.test/next')];
    for (const source of ['request', 'response']) items[0][source].headers = [{ name: 'X-测试😀', value: segment }];
    const captured = JSON.stringify(items), ui = await openDOM(t, createHost().main, items);
    ui.click('.request-items [index="0"]', true);
    ui.click('.request-panel .tab[name="请求路径"]');
    assert.deepEqual(values(ui), [['1', segment], ['2', 'last']]);
    assert.equal(ui.query('.request-path img'), null);
    assert.equal(ui.window.injected, undefined);
    assert.equal(ui.query('.request-path details, .request-path .collapsable'), null);
    for (const source of ['request', 'response']) {
        const headerTable = ui.query('[data-table="obj.' + source + '.headers"]');
        assert.equal(headerTable.querySelector('.data-key').textContent, 'X-测试😀');
        assert.equal(headerTable.querySelector('.data-value').textContent, segment);
        assert.equal(headerTable.querySelector('img'), null);
    }
    ui.click('.request-panel .tab[name="原始"]');
    assert.ok(ui.window.rawViewers.request);
    ui.click('.request-panel .tab[name="请求路径"]');
    assert.equal(ui.window.rawViewers.request, null);
    assert.deepEqual(values(ui), [['1', segment], ['2', 'last']]);
    ui.click('.request-items [index="1"]');
    assert.deepEqual(values(ui), [['1', 'next']]);
    ui.click('.inspector-close');
    ui.click('.request-items [index="0"]', true);
    assert.deepEqual(values(ui), [['1', segment], ['2', 'last']]);
    assert.equal(JSON.stringify(ui.window.har.log.entries), captured);
});

test('path index column resizes independently of headers and persists across selection', async t => {
    const ui = await openDOM(t, createHost().main, [withURL('https://example.test/a/b'), withURL('https://example.test/c')]);
    ui.click('.request-items [index="0"]', true);
    ui.click('.request-panel .tab[name="请求路径"]');
    const inspector = ui.query('.request-inspector'), table = ui.query('.request-path-table');
    const resizer = table.querySelector('.data-table-column-resizer');
    table.getBoundingClientRect = () => ({ left: 0, width: 600 });
    resizer.getBoundingClientRect = () => ({ left: (parseFloat(inspector.style.getPropertyValue('--request-path-index-width')) || 80) - 4, width: 8 });
    resizer.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(inspector.style.getPropertyValue('--request-path-index-width'), '92px');
    resizer.dispatchEvent(new ui.window.MouseEvent('pointerdown', { clientX: 92, bubbles: true }));
    ui.window.dispatchEvent(new ui.window.MouseEvent('pointermove', { clientX: 132 }));
    ui.window.dispatchEvent(new ui.window.MouseEvent('pointerup'));
    assert.equal(inspector.style.getPropertyValue('--request-path-index-width'), '132px');
    assert.equal(inspector.style.getPropertyValue('--inspector-key-width'), '');
    assert.equal(ui.window.document.body.classList.contains('resizing-columns'), false);
    ui.click('.request-items [index="1"]');
    assert.equal(inspector.style.getPropertyValue('--request-path-index-width'), '132px');
    assert.equal(table.querySelectorAll('.data-table-column-resizer').length, 1);
    assert.equal(ui.window.getComputedStyle(table.querySelector('.data-row')).display, 'grid');
    assert.deepEqual(values(ui), [['1', 'c']]);
});
