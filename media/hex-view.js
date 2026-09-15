// Virtualized byte view: only visible rows are rendered; selection uses offsets.
/* global ResizeObserver */
function mountHex(parent, body, copyText) {
    if (!body.capturedBytes || !body.bytes) throw new Error('Captured bytes are required for Hex');
    const bytes = body.bytes, doc = parent.ownerDocument;
    const node = (tag, className, text) => {
        const el = doc.createElement(tag); el.className = className;
        if (text != null) el.textContent = text;
        return el;
    };
    const controls = node('div', 'hex-controls');
    const query = node('input', 'hex-query');
    query.placeholder = '查找字节，如 FF 00 4A'; query.setAttribute('aria-label', '查找十六进制字节');
    const find = node('button', '', '查找下一个');
    const copy = node('button', '', '复制所选字节'); copy.disabled = true;
    const status = node('span', 'hex-status'); status.setAttribute('role', 'status');
    controls.append(query, find, copy, status);
    const header = node('div', 'hex-header', '偏移地址    十六进制字节                                      ASCII');
    const viewport = node('div', 'hex-scroll'); viewport.tabIndex = 0;
    viewport.setAttribute('aria-label', '十六进制数据；点击字节选择，Shift 点击选择范围');
    const spacer = node('div', 'hex-spacer'), rows = node('div', 'hex-rows');
    spacer.append(rows); viewport.append(spacer); parent.append(controls, header, viewport);
    const totalRows = Math.max(1, Math.ceil(bytes.length / 16)), rowHeight = 22;
    const height = Math.min(totalRows * rowHeight, 8000000);
    spacer.style.height = height + 'px';
    let start = -1, end = -1, cursor = -1, anchor = 0, destroyed = false, searchId = 0;
    function firstRow() {
        const visible = Math.max(1, Math.floor(viewport.clientHeight / rowHeight));
        return Math.min(totalRows - 1, Math.floor(viewport.scrollTop / Math.max(1, height - viewport.clientHeight) * Math.max(0, totalRows - visible)));
    }
    function render() {
        const first = firstRow(), count = Math.max(4, Math.ceil((viewport.clientHeight || 300) / rowHeight) + 2);
        rows.replaceChildren(); rows.style.top = viewport.scrollTop + 'px';
        for (let row = first; row < Math.min(totalRows, first + count); row++) {
            const offset = row * 16, line = node('div', 'hex-row');
            line.append(node('span', 'hex-offset', offset.toString(16).toUpperCase().padStart(8, '0')));
            const values = node('span', 'hex-values'); let ascii = '';
            for (let i = 0; i < 16; i++) {
                const index = offset + i;
                const value = node('span', 'hex-byte', index < bytes.length ? bytes[index].toString(16).toUpperCase().padStart(2, '0') : '  ');
                if (index < bytes.length) {
                    value.dataset.offset = index;
                    if (index >= start && index <= end) value.classList.add('selected');
                    ascii += bytes[index] >= 32 && bytes[index] <= 126 ? String.fromCharCode(bytes[index]) : '.';
                }
                values.append(value);
            }
            line.append(values, node('span', 'hex-ascii', ascii)); rows.append(line);
        }
    }
    function select(from, to) {
        cursor = to;
        start = Math.min(from, to); end = Math.max(from, to); copy.disabled = start < 0;
        status.textContent = start < 0 ? '' : `${end - start + 1} 字节已选`; render();
    }
    function reveal(offset) {
        const visible = Math.max(1, Math.floor(viewport.clientHeight / rowHeight));
        viewport.scrollTop = Math.floor(offset / 16) / Math.max(1, totalRows - visible) * Math.max(0, height - viewport.clientHeight); render();
    }
    viewport.addEventListener('scroll', render);
    rows.addEventListener('click', event => {
        const cell = event.target.closest('[data-offset]'); if (!cell) return;
        const offset = Number(cell.dataset.offset);
        if (!event.shiftKey || start < 0) anchor = offset;
        select(anchor, offset);
    });
    viewport.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && start >= 0) { event.preventDefault(); copy.click(); return; }
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -16, ArrowDown: 16 }[event.key];
        if (delta == null || !bytes.length) return;
        event.preventDefault();
        const next = Math.max(0, Math.min(bytes.length - 1, cursor < 0 ? 0 : cursor + delta));
        if (!event.shiftKey || start < 0) anchor = next;
        select(anchor, next); reveal(next);
    });
    copy.addEventListener('click', async () => {
        const parts = [], copyStart = start, copyEnd = end;
        status.textContent = '复制中…';
        for (let i = copyStart; i <= copyEnd; i += 16384) {
            if (destroyed) return;
            parts.push(Array.from(bytes.subarray(i, Math.min(copyEnd + 1, i + 16384)), b => b.toString(16).toUpperCase().padStart(2, '0')).join(' '));
            if (i + 16384 <= copyEnd) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const value = parts.join(' ');
        try { await copyText(value); status.textContent = '已复制'; } catch (_) { status.textContent = '复制失败，请重试'; }
    });
    async function search() {
        const id = ++searchId;
        const value = query.value.replace(/\s+/g, '');
        if (!value || value.length % 2 || !/^[0-9a-f]+$/i.test(value)) { status.textContent = '请输入完整的十六进制字节，例如 FF 00'; return; }
        const pattern = Uint8Array.from(value.match(/../g), b => parseInt(b, 16));
        // KMP avoids quadratic scans on repetitive binary content.
        const prefix = new Uint32Array(pattern.length);
        for (let i = 1, j = 0; i < pattern.length; i++) {
            while (j && pattern[i] !== pattern[j]) j = prefix[j - 1];
            if (pattern[i] === pattern[j]) j++;
            prefix[i] = j;
        }
        const limit = Math.max(0, bytes.length - pattern.length + 1), from = Math.min(limit, Math.max(0, start + 1));
        status.textContent = '查找中…';
        for (const [lo, hi] of [[from, limit], [0, from]]) {
            let matched = 0;
            const lastByte = Math.min(bytes.length, hi + pattern.length - 1);
            for (let chunk = lo; lo < hi && chunk < lastByte; chunk += 65536) {
                if (destroyed || id !== searchId) return;
                for (let i = chunk; i < Math.min(lastByte, chunk + 65536); i++) {
                    while (matched && bytes[i] !== pattern[matched]) matched = prefix[matched - 1];
                    if (bytes[i] === pattern[matched]) matched++;
                    if (matched === pattern.length) { const found = i - matched + 1; anchor = found; select(found, i); reveal(found); return; }
                }
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        status.textContent = '未找到';
    }
    find.addEventListener('click', search);
    query.addEventListener('input', () => { searchId++; status.textContent = ''; });
    query.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); search(); } });
    render();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null;
    if (observer) observer.observe(viewport);
    return { destroy() { destroyed = true; searchId++; if (observer) observer.disconnect(); }, reveal, select };
}

module.exports = { mountHex };
