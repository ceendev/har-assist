// Text and captured bytes are separate. Never invent bytes from HAR strings.
function describe(text, mimeType, encoding = '') {
    const original = String(text == null ? '' : text);
    const mime = String(mimeType || '').toLowerCase().split(';', 1)[0].trim();
    const jsonMime = /^(application|text)\/(?:[^/]+\+)?json$/.test(mime);
    const image = mime.startsWith('image/');
    const media = mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : '';
    let textual = !mime || mime.startsWith('text/') || jsonMime ||
        /^application\/(?:[^/]+\+)?xml$/.test(mime) ||
        ['application/javascript', 'application/ecmascript', 'application/x-www-form-urlencoded', 'application/graphql'].includes(mime);
    let decoded = original, bytes = null;
    let capturedBytes = false;
    if (encoding === 'base64' && typeof text === 'string') {
        try {
            const binary = atob(original);
            bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
            capturedBytes = true;
            if (textual) {
                const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(mimeType || '');
                try { decoded = new TextDecoder(charset ? charset[1] : 'utf-8', { ignoreBOM: true }).decode(bytes); }
                catch (_) {
                    decoded = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
                }
            }
        } catch (_) {
            bytes = null;
            capturedBytes = false;
            textual = true;
        }
    } else if (encoding) {
        textual = true;
    }
    let json = false;
    if (textual && decoded.length) {
        try { JSON.parse(decoded); json = true; } catch (_) { /* Plain text is valid viewer content. */ }
    }
    let language = 'text';
    if (json) language = 'json';
    else if (!jsonMime && /html/.test(mime)) language = 'html';
    else if (!jsonMime && /xml/.test(mime) && !image) language = 'xml';
    else if (/javascript|ecmascript/.test(mime)) language = 'javascript';
    else if (mime === 'text/css') language = 'css';
    const preview = image ? 'image' : media || (language === 'html' ? 'html' : '');
    // A binary MIME without captured bytes can still expose its recorded HAR
    // string as text, but must not fabricate a Hex view of that string.
    if (!capturedBytes && !preview) textual = true;
    return { original, text: decoded, bytes, textual, json, language, mime, preview, capturedBytes };
}

// Preserve number spelling, large integers and duplicate keys when indenting JSON.
function prettyJSON(text) {
    let result = '', depth = 0, quoted = false, escaped = false;
    const newline = () => '\n' + '  '.repeat(Math.min(depth, 64));
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            result += c;
            if (escaped) escaped = false;
            else if (c === '\\') escaped = true;
            else if (c === '"') quoted = false;
        } else if (c === '"') { quoted = true; result += c; }
        else if (/\s/.test(c)) continue;
        else if (c === '{' || c === '[') {
            const closing = c === '{' ? '}' : ']';
            let next = i + 1;
            while (next < text.length && /\s/.test(text[next])) next++;
            result += c;
            if (text[next] === closing) { result += closing; i = next; }
            else { depth++; result += newline(); }
        } else if (c === '}' || c === ']') { depth--; result += newline() + c; }
        else if (c === ',') result += ',' + newline();
        else if (c === ':') result += ': ';
        else result += c;
    }
    return result;
}

function hexRow(bytes, offset) {
    const values = bytes.subarray(offset, offset + 16);
    const hex = Array.from(values, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ').padEnd(47, ' ');
    const ascii = Array.from(values, b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
    return offset.toString(16).padStart(8, '0').toUpperCase() + '  ' + hex + '  ' + ascii;
}

module.exports = { describe, prettyJSON, hexRow };
