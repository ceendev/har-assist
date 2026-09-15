const assert = require('node:assert/strict');
const { test } = require('node:test');
const { entry, createHost, openDOM } = require('./helpers/body-webview');

test('request URLs retain complete text and size the shared grid from visible rows', async t => {
    const long = entry(), short = entry();
    long.request.url = 'https://example.test/long?text=' + '中😀<&>'.repeat(40) + '&end=complete';
    short.request.url = 'https://example.test/short';
    const ui = await openDOM(t, createHost().main, [long, short]);
    const spans = ui.window.document.querySelectorAll('.request-items .request-url-text');
    assert.equal(spans[0].textContent, long.request.url);
    assert.equal(spans[0].parentElement.title, long.request.url);
    // jsdom has no glyph measurement; supply geometry but run the real sizing
    // and filtering code, and verify real Chromium scrolling separately.
    spans[0].getBoundingClientRect = () => ({ width: 1700.4 });
    spans[1].getBoundingClientRect = () => ({ width: 220 });
    ui.window.updateRequestURLWidth();
    const layout = ui.query('.main-layout');
    assert.equal(layout.style.getPropertyValue('--request-url-content-width'), '1719px');
    const search = ui.query('.search');
    search.value = '/short';
    search.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(layout.style.getPropertyValue('--request-url-content-width'), '238px');
    search.value = 'no matches';
    search.dispatchEvent(new ui.window.Event('input', { bubbles: true }));
    assert.equal(layout.style.getPropertyValue('--request-url-content-width'), '160px');
    ui.click('.clear-search');
    assert.equal(layout.style.getPropertyValue('--request-url-content-width'), '1719px');
    assert.equal(ui.window.getComputedStyle(ui.query('.request-list-pane')).overflowX, 'auto');
    for (const selector of ['.request-time-header', '.request-status-header', '.request-items .time', '.request-items .status']) {
        assert.equal(ui.window.getComputedStyle(ui.query(selector)).position, 'sticky');
    }
});

test('column resizing expands scrollable columns and keeps pinned widths synchronized', async t => {
    const ui = await openDOM(t, createHost().main, [entry()]);
    const widths = [56, 150, 78, 1018, 72, 58];
    const minimums = [42, 90, 60, 1018, 60, 54];
    assert.deepEqual(Array.from(ui.window.resizeRequestColumns(widths, 0, 40, minimums)), [96, 150, 78, 1018, 72, 58]);
    assert.deepEqual(Array.from(ui.window.resizeRequestColumns(widths, 3, -200, minimums)), widths);
    assert.deepEqual(Array.from(ui.window.resizeRequestColumns(widths, 3, 200, minimums)), [56, 150, 78, 1218, 72, 58]);
    assert.deepEqual(Array.from(ui.window.resizeRequestColumns(widths, 4, 100, minimums)), [56, 150, 78, 1018, 76, 54]);
    Array.from(ui.query('.request-list-header').children).forEach((cell, i) => {
        cell.getBoundingClientRect = () => ({ width: widths[i] });
    });
    const layout = ui.query('.main-layout');
    layout.style.setProperty('--request-url-content-width', '1018px');
    const key = (index, value) => ui.query('[data-column-index="' + index + '"]').dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    key(0, 'ArrowRight');
    assert.equal(layout.style.getPropertyValue('--request-id-width'), '68px');
    assert.equal(layout.style.getPropertyValue('--request-url-user-width'), '');
    key(4, 'ArrowRight');
    assert.equal(layout.style.getPropertyValue('--request-time-width'), '76px');
    assert.equal(layout.style.getPropertyValue('--request-status-width'), '54px');
    key(3, 'ArrowLeft');
    assert.equal(layout.style.getPropertyValue('--request-url-user-width'), '1018px');
    const handle = ui.query('[data-column-index="1"]');
    handle.dispatchEvent(new ui.window.MouseEvent('pointerdown', { clientX: 200, bubbles: true }));
    ui.window.dispatchEvent(new ui.window.MouseEvent('pointermove', { clientX: 240 }));
    assert.equal(layout.style.getPropertyValue('--request-application-width'), '190px');
    ui.window.dispatchEvent(new ui.window.Event('pointercancel'));
    assert.equal(ui.window.document.body.classList.contains('resizing-columns'), false);
    ui.window.dispatchEvent(new ui.window.MouseEvent('pointermove', { clientX: 500 }));
    assert.equal(layout.style.getPropertyValue('--request-application-width'), '190px');
});

test('vertical request navigation preserves horizontal URL scrolling and accounts for the sticky header', async t => {
    const ui = await openDOM(t, createHost().main, [entry(), entry()]);
    const pane = ui.query('.request-list-pane'), row = ui.query('.request-items [index="0"]');
    pane.getBoundingClientRect = () => ({ top: 100 });
    Object.defineProperty(pane, 'clientHeight', { value: 300 });
    ui.query('.request-list-header').getBoundingClientRect = () => ({ height: 36 });
    row.getBoundingClientRect = () => ({ top: 110, height: 35 });
    pane.scrollLeft = 800; pane.scrollTop = 100;
    ui.window.scrollRequestRowIntoView(row);
    assert.equal(pane.scrollLeft, 800);
    assert.equal(pane.scrollTop, 74);
    row.getBoundingClientRect = () => ({ top: 390, height: 35 });
    ui.window.scrollRequestRowIntoView(row);
    assert.equal(pane.scrollLeft, 800);
    assert.equal(pane.scrollTop, 99);
    ui.click('.request-items [index="0"]');
    ui.window.document.dispatchEvent(new ui.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert.equal(ui.window.selectedIndex, 1);
    assert.equal(pane.scrollLeft, 800);
});
