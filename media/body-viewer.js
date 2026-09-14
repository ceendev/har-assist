/* eslint-env browser */
// Shared by the Inspector and the standalone body tab. HAR bodies are read-only.
(function (root) {
    "use strict";

    function describe(text, mimeType) {
        var mime = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
        var jsonMime = /^(application|text)\/(?:[^/]+\+)?json$/.test(mime);
        var textual = !mime || mime.startsWith("text/") || jsonMime ||
            /^application\/(?:[^/]+\+)?xml$/.test(mime) ||
            ["application/javascript", "application/ecmascript", "application/x-www-form-urlencoded", "application/graphql"].includes(mime);
        var result = { text: String(text == null ? "" : text), textual: textual, json: false };
        // Never interpret image/media/binary data as JSON, even if its bytes look like it.
        if (textual && result.text.length) {
            try {
                result.value = JSON.parse(result.text);
                result.json = true;
            } catch (_) { /* Invalid JSON is still readable as original text. */ }
        }
        return result;
    }

    function mount(container, text, mimeType) {
        var body = describe(text, mimeType);
        if (!body.textual) return null;
        if (typeof root.JSONEditor !== "function") throw new Error("JSONEditor is unavailable");
        container.classList.add("body-viewer");
        var editor;
        function refreshMode() {
            if (!editor) return;
            var mode = editor.getMode();
            // Keep the original text (including whitespace and number spelling) in text/code mode.
            if (mode != "tree") editor.setText(body.text);
            if (editor.aceEditor) {
                editor.aceEditor.getSession().setUseWorker(false);
                editor.aceEditor.resize();
            }
        }
        editor = new root.JSONEditor(container, {
            mode: body.json ? "tree" : "text",
            modes: body.json ? ["tree", "code", "text"] : ["text"],
            navigationBar: body.json,
            statusBar: true,
            history: false,
            enableSort: false,
            enableTransform: false,
            onEditable: function () { return false; },
            onModeChange: refreshMode
        });
        try {
            if (body.json) editor.set(body.value);
            else editor.setText(body.text);
        } catch (error) {
            editor.destroy();
            throw error;
        }
        var observer = typeof root.ResizeObserver == "function" ? new root.ResizeObserver(function () {
            if (editor.aceEditor) editor.aceEditor.resize();
        }) : null;
        if (observer) observer.observe(container);
        var destroy = editor.destroy.bind(editor);
        editor.destroy = function () {
            if (observer) observer.disconnect();
            destroy();
        };
        return editor;
    }

    root.HarBodyViewer = { describe: describe, mount: mount };
})(window);
