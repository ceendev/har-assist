const assert = require('node:assert/strict');
const { test } = require('node:test');
const { describe, describeHTTP, prettyJSON, hexRow } = require('../media/body-data');

test('Raw byte composition contains the entire prefix and appends Base64 bytes without text re-encoding', () => {
    const prefix = 'POST /api?a=1 HTTP/1.1\nX-Value: 中\nX-Value: secret\n\n';
    for (const payload of [
        { text: 'AP9B', encoding: 'base64' },
        { text: '', encoding: 'base64' },
        { text: '中😀\r\n', encoding: '' },
        { text: 'invalid!', encoding: 'base64' },
        { text: 'AP9B', encoding: 'unknown' },
        { text: undefined, encoding: 'base64' }
    ]) {
        const original = { ...payload };
        const tail = payload.encoding === 'base64' && ['', 'AP9B'].includes(payload.text)
            ? Buffer.from(payload.text, 'base64') : Buffer.from(payload.text || '');
        const text = prefix + tail.toString('latin1');
        const data = describeHTTP(text, prefix, payload);
        assert.equal(data.text, text);
        assert.equal(data.language, 'text');
        assert.equal(data.preview, '');
        assert.equal(data.capturedBytes, false);
        assert.deepEqual(Array.from(data.bytes), Array.from(Buffer.concat([Buffer.from(prefix), tail])));
        assert.deepEqual(payload, original);
    }
});

test('only explicit Base64 captures yield bytes; text and decode failures never synthesize bytes', () => {
    const data = describe('AP9B', 'application/octet-stream', 'base64');
    assert.deepEqual(Array.from(data.bytes), [0, 255, 65]);
    assert.equal(data.textual, false);
    assert.equal(data.capturedBytes, true);
    const unicode = describe('中😀\r\n', 'text/plain');
    assert.equal(unicode.text, '中😀\r\n');
    assert.equal(unicode.bytes, null);
    assert.equal(unicode.capturedBytes, false);
    assert.equal(describe('6Q==', 'text/plain; charset=windows-1252', 'base64').text, 'é');
    assert.deepEqual(Array.from(describe('6Q==', 'text/plain; charset=unsupported-charset', 'base64').bytes), [0xe9]);
    const invalid = describe('not base64!', 'application/octet-stream', 'base64');
    assert.equal(invalid.text, 'not base64!');
    assert.equal(invalid.textual, true);
    assert.equal(invalid.capturedBytes, false);
    assert.equal(invalid.bytes, null);
    for (const [text, encoding] of [['AP9B', ''], ['AP9B', 'unknown'], [null, 'base64'], [undefined, 'base64'], [12, 'base64']]) {
        assert.equal(describe(text, 'text/plain', encoding).bytes, null);
    }
    assert.equal(describe('', 'text/plain', 'base64').bytes.length, 0, 'Explicitly saved empty bytes differ from unavailable bytes');
});

test('JSON is detected by parsing, other content stays in its appropriate language', () => {
    for (const mime of ['application/json', 'application/problem+json', 'text/plain', '']) assert.equal(describe('{"a":1}', mime).language, 'json');
    assert.equal(describe('{"a":', 'application/json').language, 'text');
    for (const [mime, language] of [['application/xml', 'xml'], ['text/html', 'html'], ['application/javascript', 'javascript'], ['text/css', 'css']]) assert.equal(describe('<data/>', mime).language, language);
    for (const mime of ['image/png', 'image/svg+xml', 'audio/mpeg', 'video/mp4', 'application/octet-stream', 'application/pdf']) assert.equal(describe('{"a":1}', mime).json, false);
});

test('JSON formatting preserves exact scalar tokens, duplicate keys and escape sequences', () => {
    const raw = '{"id":9007199254740993,"id":1e999,"x":-0,"t":"中😀 \\\" \\n","e":{},"a":[[],null,true]}';
    const formatted = prettyJSON(raw);
    assert.match(formatted, /9007199254740993/);
    assert.match(formatted, /1e999/);
    assert.match(formatted, /"x": -0/);
    assert.equal((formatted.match(/"id"/g) || []).length, 2);
    assert.deepEqual(JSON.parse(formatted), JSON.parse(raw));
    assert.equal(prettyJSON(' { "a": [1, 2] } '), '{\n  "a": [\n    1,\n    2\n  ]\n}');
});

test('hex rows have correct byte offsets, padding and safe printable ASCII', () => {
    const bytes = Uint8Array.from([0, 255, 65, 60, 10, ...Array(20).fill(66)]);
    assert.match(hexRow(bytes, 0), /^00000000  00 FF 41 3C 0A/);
    assert.match(hexRow(bytes, 0), /\.\.A<\.BBBBBBBBBBB$/);
    assert.match(hexRow(bytes, 16), /^00000010/);
});
