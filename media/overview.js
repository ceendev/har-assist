// Read-only overview of standard HAR fields and Reqable's exported metadata.
const missing = '—';
const present = value => value !== undefined && value !== null && value !== '';
const first = (...values) => values.find(present);
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const display = value => present(value) ? String(value) : missing;
const sum = (...values) => values.every(value => value !== null) ? values.reduce((a, b) => a + b, 0) : null;
const duration = value => value === null ? missing : Number(value.toFixed(3)) + 'ms';
const header = (message, name) => (Array.isArray(message.headers) ? message.headers : [])
    .filter(item => String(item.name).toLowerCase() === name)
    .map(item => String(item.value)).join(', ');

function formatSize(value) {
    value = number(value);
    if (value === null) return missing;
    if (value < 1024) return value + ' B';
    const units = ['KB', 'MB', 'GB', 'TB'];
    let unit = -1;
    do { value /= 1024; unit++; } while (value >= 1024 && unit < units.length - 1);
    return value.toFixed(2) + ' ' + units[unit];
}

// Reqable's request/response timestamps are epoch microseconds; connection
// timestamps are milliseconds. Keep the extra precision out of Date's rounding.
function fromISO(value) {
    if (typeof value !== 'string') return null;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return null;
    const fraction = /\.(\d+)(?:Z|[+-]\d\d:?\d\d)$/.exec(value);
    return ms * 1000 + (fraction ? Number(fraction[1].padEnd(6, '0').slice(3, 6)) : 0);
}

function formatTime(us, precision = 6) {
    if (us === null || !Number.isSafeInteger(us)) return missing;
    const date = new Date(Math.floor(us / 1000));
    if (!Number.isFinite(date.getTime())) return missing;
    const pad = (value, width = 2) => String(value).padStart(width, '0');
    const fraction = pad(((us % 1000000) + 1000000) % 1000000, 6).slice(0, precision);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' +
        pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds()) + '.' + fraction;
}

function times(entry) {
    const request = entry.request || {}, response = entry.response || {}, timings = entry.timings || {};
    const start = fromISO(entry.startedDateTime), total = number(entry.time);
    const add = (time, ms) => time !== null && ms !== null ? time + Math.round(ms * 1000) : null;
    const difference = (end, begin) => end !== null && begin !== null && end >= begin ? (end - begin) / 1000 : null;
    // SSL is included in connect in HAR, so it must not be counted twice.
    const setup = ['blocked', 'dns', 'connect'].reduce((value, key) => value + (number(timings[key]) || 0), 0);
    const requestStart = first(number(request._startTimestamp), add(start, setup)) ?? null;
    const requestEnd = first(number(request._endTimestamp), add(requestStart, number(timings.send))) ?? null;
    const responseStart = first(number(response._startTimestamp), add(requestEnd, number(timings.wait))) ?? null;
    const responseEnd = first(number(response._endTimestamp), add(responseStart, number(timings.receive)), add(start, total)) ?? null;
    return {
        requestStart: formatTime(requestStart), requestEnd: formatTime(requestEnd),
        requestDuration: duration(first(difference(requestEnd, requestStart), number(timings.send)) ?? null),
        responseStart: formatTime(responseStart), responseEnd: formatTime(responseEnd),
        responseDuration: duration(first(difference(responseEnd, responseStart), number(timings.receive)) ?? null),
        total: duration(first(total, difference(responseEnd, requestStart)) ?? null)
    };
}

function headerSize(message, isRequest, reqable) {
    const size = number(message.headersSize);
    if (size === null || !reqable) return size;
    // Reqable exports header-field bytes only. Its overview includes the
    // request/status line and final CRLF too; standard HAR already includes them.
    if (!message.httpVersion) return null;
    let line;
    if (isRequest) {
        if (!message.method) return null;
        try {
            const url = new URL(message.url);
            const target = message.method === 'CONNECT' ? url.host : url.pathname + url.search;
            line = message.method + ' ' + target + ' ' + message.httpVersion + '\r\n';
        } catch (_) { return null; }
    } else {
        if (!present(message.status)) return null;
        line = message.httpVersion + ' ' + message.status + ' ' + (message.statusText || '') + '\r\n';
    }
    return size + new TextEncoder().encode(line).length + 2;
}

function createOverview(entry, creator = {}) {
    const request = entry.request || {}, response = entry.response || {}, app = entry._app || {};
    const version = first(request.httpVersion, response.httpVersion);
    const server = first(entry._serverAddress, entry.serverIPAddress), port = entry._serverPort;
    const address = present(server) && present(port)
        ? (String(server).includes(':') && !String(server).startsWith('[') ? '[' + server + ']' : server) + ':' + port : server;
    const connection = (header(request, 'connection') + ',' + header(response, 'connection')).toLowerCase().split(',').map(value => value.trim());
    const keepAlive = first(entry._keepAlive, connection.includes('close') ? false : connection.includes('keep-alive') ? true : undefined);
    const recordedStatus = first(request._status, response._status);
    const statusNames = { completed: 'Completed', aborted: 'Aborted', failed: 'Failed', pending: 'Pending' };
    const status = present(recordedStatus) ? (Object.hasOwn(statusNames, recordedStatus) ? statusNames[recordedStatus] : recordedStatus)
        : first(entry._error, response._error) ? 'Failed' : number(response.status) > 0 ? 'Completed' : undefined;
    const timing = times(entry);
    const reqable = String(creator.name || '').toLowerCase() === 'reqable';
    const requestHeaders = headerSize(request, true, reqable), requestBody = number(request.bodySize);
    const responseHeaders = headerSize(response, false, reqable), responseBody = number(response.bodySize);
    const requestSize = sum(requestHeaders, requestBody), responseSize = sum(responseHeaders, responseBody);
    const row = (key, label, value, nested = false) => ({ key, label, value: display(value), nested });
    return [
        { key: 'basic', rows: [
            row('status', '状态', status), row('method', '方法', request.method), row('protocol', '协议', version),
            row('code', 'Code', response.status), row('server', '服务器地址', address), row('keepAlive', 'Keep Alive', keepAlive),
            row('stream', '流', present(entry._sid) ? '#' + entry._sid : undefined),
            row('contentType', 'Content Type', first(header(request, 'content-type'), request.postData && request.postData.mimeType)),
            row('proxy', '代理协议', entry._proxyProtocol)
        ] },
        { key: 'application', label: '应用程序', rows: [row('name', '名称', app.name), row('id', 'ID', app.id)] },
        { key: 'connection', label: '连接', rows: [
            row('id', 'ID', first(entry._cid, entry.connection)), row('time', '时间', formatTime(number(entry._ctime) === null ? null : Math.round(entry._ctime * 1000), 3)),
            row('clientAddress', '客户端 地址', entry._clientAddress), row('clientPort', '客户端 端口', entry._clientPort),
            row('serverAddress', '服务端 地址', server), row('serverPort', '服务端 端口', port)
        ] },
        { key: 'timing', label: '时间', rows: [
            row('requestStart', '请求开始', timing.requestStart), row('requestEnd', '请求结束', timing.requestEnd), row('requestDuration', '请求时长', timing.requestDuration),
            row('responseStart', '响应开始', timing.responseStart), row('responseEnd', '响应结束', timing.responseEnd), row('responseDuration', '响应时长', timing.responseDuration),
            row('total', '总时长', timing.total)
        ] },
        { key: 'size', label: '大小', rows: [
            row('request', '请求', formatSize(requestSize)), row('requestHeaders', '请求头', formatSize(requestHeaders), true), row('requestBody', '请求体', formatSize(requestBody), true),
            row('response', '响应', formatSize(responseSize)), row('responseHeaders', '响应头', formatSize(responseHeaders), true), row('responseBody', '响应体', formatSize(responseBody), true),
            row('total', '总计', formatSize(sum(requestSize, responseSize)))
        ] }
    ];
}

function renderOverview(container, entry, creator) {
    const openGroups = new Map(Array.from(container.querySelectorAll('details'), section => [section.dataset.overviewGroup, section.open]));
    const doc = container.ownerDocument;
    const node = (tag, className, value) => {
        const element = doc.createElement(tag); element.className = className;
        if (value !== undefined) element.textContent = value;
        return element;
    };
    const sections = createOverview(entry, creator).map(group => {
        const section = node(group.label ? 'details' : 'div', 'overview-group');
        section.dataset.overviewGroup = group.key;
        if (group.label) {
            section.open = openGroups.get(group.key) !== false;
            const summary = node('summary', 'overview-heading', group.label);
            const icon = node('span', 'codicon codicon-chevron-down'); icon.setAttribute('aria-hidden', 'true');
            summary.append(icon); section.append(summary);
        }
        const rows = node('dl', 'overview-rows'); rows.setAttribute('data-overview-table', '');
        for (const row of group.rows) {
            const item = node('div', 'overview-row' + (row.nested ? ' overview-nested' : ''));
            item.dataset.overviewField = group.key + '.' + row.key;
            const value = node('dd', 'overview-value', row.value);
            value.title = row.value;
            item.append(node('dt', 'overview-key', row.label), value); rows.append(item);
        }
        section.append(rows); return section;
    });
    container.replaceChildren(...sections);
    container.scrollTop = 0;
}

module.exports = { createOverview, renderOverview, formatTime, formatSize };
