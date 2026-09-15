const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createOverview, formatTime } = require('../media/overview');
const { overviewEntry } = require('./helpers/overview-entry');
process.env.TZ = 'Asia/Shanghai';

const values = (entry, creator) => Object.fromEntries(createOverview(entry, creator).flatMap(group => group.rows.map(row => [group.key + '.' + row.key, row.value])));

test('Reqable metadata maps to overview fields without losing microseconds or zero values', () => {
    const item = overviewEntry(), original = JSON.stringify(item), rows = values(item, { name: 'Reqable' });
    assert.equal(rows['basic.status'], 'Completed');
    assert.equal(rows['basic.server'], '203.0.113.8:443');
    assert.equal(rows['basic.keepAlive'], 'true');
    assert.equal(rows['basic.stream'], '#1');
    assert.equal(rows['basic.contentType'], '—', 'Request MIME must not be replaced by response MIME');
    assert.equal(rows['basic.proxy'], '—');
    assert.equal(rows['application.name'], item._app.name);
    assert.equal(rows['application.id'], item._app.id);
    assert.equal(rows['connection.id'], '145');
    assert.equal(rows['connection.time'], '2026-08-10 20:36:20.581');
    assert.equal(rows['timing.requestStart'], '2026-08-10 20:36:20.606174');
    assert.equal(rows['timing.requestEnd'], '2026-08-10 20:36:20.606797');
    assert.equal(rows['timing.requestDuration'], '0.623ms');
    assert.equal(rows['timing.responseStart'], '2026-08-10 20:36:20.878452');
    assert.equal(rows['timing.responseEnd'], '2026-08-10 20:36:20.879810');
    assert.equal(rows['timing.responseDuration'], '1.358ms');
    assert.equal(rows['timing.total'], '273ms');
    assert.equal(rows['size.requestBody'], '0 B');
    assert.equal(rows['size.responseHeaders'], '250 B');
    assert.equal(rows['size.responseBody'], '1010 B');
    assert.equal(rows['size.response'], '1.23 KB');
    assert.equal(JSON.stringify(item), original);
});

test('Reqable and standard HAR header sizes follow their own conventions, not decoded content size', () => {
    const item = overviewEntry();
    item.request.url += '?q=' + 'x'.repeat(3831);
    item.response.content.size = 999999;
    const standard = values(item), reqable = values(item, { name: 'Reqable' });
    assert.equal(standard['size.requestHeaders'], '188 B');
    assert.equal(standard['size.responseHeaders'], '231 B');
    assert.equal(reqable['size.requestHeaders'], '3.95 KB');
    assert.equal(reqable['size.total'], '5.18 KB');
    assert.equal(reqable['size.responseBody'], '1010 B');
    item.response.bodySize = -1;
    const unknown = values(item);
    assert.equal(unknown['size.responseBody'], '—');
    assert.equal(unknown['size.response'], '—');
    assert.equal(unknown['size.total'], '—');
});

test('standard HAR timing fallback counts SSL only inside connect and retains timestamp precision', () => {
    const item = { startedDateTime: '2026-08-10T12:36:20.606174Z', time: 44,
        timings: { blocked: 5, dns: 2, connect: 10, ssl: 7, send: 3, wait: 20, receive: 4 } };
    const rows = values(item);
    assert.equal(rows['timing.requestStart'], '2026-08-10 20:36:20.623174');
    assert.equal(rows['timing.requestEnd'], '2026-08-10 20:36:20.626174');
    assert.equal(rows['timing.responseStart'], '2026-08-10 20:36:20.646174');
    assert.equal(rows['timing.responseEnd'], '2026-08-10 20:36:20.650174');
    assert.equal(rows['timing.requestDuration'], '3ms');
    assert.equal(rows['timing.responseDuration'], '4ms');
    assert.equal(rows['timing.total'], '44ms');
});

test('missing and invalid fields stay unknown; false, zero, IPv6, errors and request MIME stay distinct', () => {
    const empty = values({ startedDateTime: 'invalid', timings: { send: -1, receive: -1 }, time: -1 });
    assert.ok(Object.values(empty).every(value => value === '—'));
    assert.equal(formatTime(NaN), '—');
    assert.equal(formatTime(Infinity), '—');
    const item = overviewEntry();
    Object.assign(item, { _keepAlive: false, _sid: 0, _cid: 0, _proxyProtocol: 'none', _serverAddress: '2001:db8::1' });
    item.request._status = 'aborted';
    item.request.headers.push({ name: 'content-type', value: 'application/xml; charset=utf-8' });
    const rows = values(item);
    assert.equal(rows['basic.status'], 'Aborted');
    assert.equal(rows['basic.server'], '[2001:db8::1]:443');
    assert.equal(rows['basic.keepAlive'], 'false');
    assert.equal(rows['basic.stream'], '#0');
    assert.equal(rows['connection.id'], '0');
    assert.equal(rows['basic.proxy'], 'none');
    assert.equal(rows['basic.contentType'], 'application/xml; charset=utf-8');
    assert.equal(values({ response: { _error: 'failure' } })['basic.status'], 'Failed');
});
