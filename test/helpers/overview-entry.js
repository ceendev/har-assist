const { entry } = require('./body-webview');

function overviewEntry() {
    const item = entry('', '{"value":1}');
    Object.assign(item, {
        startedDateTime: '2026-08-10T12:36:20.606Z', time: 273,
        connection: '145', _cid: 145, _ctime: 1786365380581, _sid: 1,
        _clientAddress: '127.0.0.1', _clientPort: 54120,
        serverIPAddress: '203.0.113.8', _serverAddress: '203.0.113.8', _serverPort: 443,
        _app: { name: 'Example Application', id: 'test.example.app' },
        timings: { send: -1, wait: -1, receive: -1 }
    });
    Object.assign(item.request, {
        method: 'GET', headers: [{ name: 'Connection', value: 'Keep-Alive' }], headersSize: 188, bodySize: 0,
        _status: 'completed', _startTimestamp: 1786365380606174, _endTimestamp: 1786365380606797
    });
    delete item.request.postData;
    Object.assign(item.response, {
        httpVersion: 'HTTP/1.1', headersSize: 231, bodySize: 1010,
        _status: 'completed', _startTimestamp: 1786365380878452, _endTimestamp: 1786365380879810
    });
    return item;
}

module.exports = { overviewEntry };
