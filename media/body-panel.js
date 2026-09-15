/* eslint-env browser */
/* global acquireVsCodeApi */
(function () {
    "use strict";
    var payload = JSON.parse(document.getElementById("body-payload").textContent);
    var container = document.getElementById("body-editor");
    var editor;
    try {
        window.HarBodyViewer.setHostApi(acquireVsCodeApi());
        editor = window.HarBodyViewer.mount(container, payload.text, payload.mimeType, payload);
        window.bodyViewer = editor;
    } catch (_) {
        container.textContent = "";
        var notice = document.createElement("p");
        notice.textContent = "内容查看器未能加载，以下显示原始文本。";
        var fallback = document.createElement("pre");
        fallback.textContent = payload.text;
        container.append(notice, fallback);
    }
    window.addEventListener("pagehide", function () { if (editor) editor.destroy(); }, { once: true });
})();
