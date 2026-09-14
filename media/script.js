var har;
var reqs = [];
var selectedReq;
var selectedIndex = -1;
var visibleIndicies = [];

const vscode = acquireVsCodeApi();

function getHeaderValue(headers, name) {
    var header = (Array.isArray(headers) ? headers : []).find(function (entry) {
        return String(entry.name || "").toLowerCase() == name.toLowerCase();
    });
    return header ? String(header.value || "") : "";
}

function getProtocolGroup(url, reqItem) {
    var response = reqItem && reqItem.response || {};
    if (String(reqItem && reqItem._resourceType || "").toLowerCase() == "websocket" ||
        Array.isArray(reqItem && reqItem._webSocketMessages) ||
        (Number(response.status) == 101 && getHeaderValue(response.headers, "upgrade").toLowerCase() == "websocket")) {
        return "websocket";
    }
    var protocolMatch = /^([a-z][a-z0-9+.-]*):/i.exec(url || "");
    if (!protocolMatch) {
        return "other";
    }
    var protocol = protocolMatch[1].toLowerCase();
    if (protocol == "ws" || protocol == "wss") {
        return "websocket";
    }
    if (protocol == "http" || protocol == "https") {
        return protocol;
    }
    return "other";
}

function getHttpVersionGroup(reqItem) {
    var version = String((reqItem && reqItem.request && reqItem.request.httpVersion) ||
        (reqItem && reqItem.response && reqItem.response.httpVersion) || "").trim();
    if (/^(?:HTTP\/?)?2(?:\.0)?$/i.test(version) || /^h2$/i.test(version)) {
        return "http2";
    }
    if (/^(?:HTTP\/?)?1(?:\.\d+)?$/i.test(version) || /^h1$/i.test(version)) {
        return "http1";
    }
    return "other";
}

function getMethodGroup(method) {
    var normalizedMethod = String(method || "").toUpperCase();
    var standardMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "CONNECT", "TRACE"];
    return standardMethods.includes(normalizedMethod) ? normalizedMethod : "other";
}

function getStatusGroup(status) {
    var statusCode = Number(status);
    if (!Number.isFinite(statusCode) || statusCode < 100 || statusCode >= 600) {
        return "other";
    }
    return Math.floor(statusCode / 100) + "xx";
}

function getContentGroup(mimeType) {
    var normalizedMimeType = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
    if (normalizedMimeType.startsWith("image/")) {
        return "image";
    }
    if (normalizedMimeType.startsWith("audio/") || normalizedMimeType.startsWith("video/")) {
        return "media";
    }
    if (normalizedMimeType.includes("json")) {
        return "json";
    }
    if (normalizedMimeType == "text/html" || normalizedMimeType == "application/xhtml+xml") {
        return "html";
    }
    if (normalizedMimeType.includes("xml")) {
        return "xml";
    }
    if (normalizedMimeType.includes("javascript") || normalizedMimeType.includes("ecmascript")) {
        return "javascript";
    }
    if (normalizedMimeType.startsWith("text/")) {
        return "text";
    }
    return "binary";
}

function getRequestDomain(url) {
    try {
        return new URL(url).host;
    } catch (error) {
        var endpointMatch = /^[^:]*:\/\/([^/]+)/.exec(url || "");
        return endpointMatch ? endpointMatch[1] : "";
    }
}

function getApplicationInfo(reqItem) {
    var app = reqItem && reqItem._app;
    if (!app) {
        return { key: "__none__", label: "未标注" };
    }
    var key = String(app.id || app.name || "__none__");
    var label = String(app.name || app.id || "未标注");
    return { key: key, label: label };
}

function matchesSearchText(value, query, mode, caseSensitive) {
    var normalizedValue = String(value || "");
    var normalizedQuery = String(query || "");
    if (!caseSensitive) {
        normalizedValue = normalizedValue.toLowerCase();
        normalizedQuery = normalizedQuery.toLowerCase();
    }
    if (mode == "startsWith") return normalizedValue.startsWith(normalizedQuery);
    if (mode == "endsWith") return normalizedValue.endsWith(normalizedQuery);
    if (mode == "equals") return normalizedValue == normalizedQuery;
    if (mode == "notContains") return !normalizedValue.includes(normalizedQuery);
    if (mode == "notEquals") return normalizedValue != normalizedQuery;
    if (mode == "wildcard" || mode == "notWildcard") {
        var wildcard = normalizedQuery.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
        var wildcardMatch = new RegExp("^" + wildcard + "$", caseSensitive ? "" : "i").test(String(value || ""));
        return mode == "wildcard" ? wildcardMatch : !wildcardMatch;
    }
    if (mode == "regex" || mode == "notRegex") {
        var regexMatch = false;
        try { regexMatch = new RegExp(normalizedQuery, caseSensitive ? "" : "i").test(String(value || "")); } catch (error) { regexMatch = false; }
        return mode == "regex" ? regexMatch : !regexMatch;
    }
    return normalizedValue.includes(normalizedQuery);
}

function getHeaderSearchValues(headers) {
    var values = [];
    (Array.isArray(headers) ? headers : []).forEach(function (header) {
        values.push(header.name || "", header.value || "", (header.name || "") + ": " + (header.value || ""));
    });
    return values;
}

function createSearchValues(reqItem, entity, responseBody) {
    var request = reqItem.request;
    var response = reqItem.response;
    var postData = request.postData || {};
    var requestValues = [entity.fullURL, entity.method, entity.rawRequest, postData.mimeType || ""]
        .concat(getHeaderSearchValues(request.headers), getHeaderSearchValues(request.cookies),
            getHeaderSearchValues(request.queryString), getHeaderSearchValues(postData.params), postData.text || "");
    (Array.isArray(postData.params) ? postData.params : []).forEach(function (parameter) {
        requestValues.push(parameter.fileName || "", parameter.contentType || "");
    });
    var responseValues = [String(response.status), response.statusText || "", entity.status,
        entity.mimeType, responseBody, entity.rawResponse]
        .concat(getHeaderSearchValues(response.headers), getHeaderSearchValues(response.cookies));
    return {
        url: [entity.fullURL],
        "request-method": [entity.method],
        "request-type": [entity.method, entity.protocolGroup],
        "request-headers": getHeaderSearchValues(request.headers),
        "request-body": [postData.text || ""],
        "request-params": getHeaderSearchValues(request.queryString).concat(getHeaderSearchValues(postData.params)),
        "request-cookies": getHeaderSearchValues(request.cookies),
        request: requestValues,
        "response-type": [entity.mimeType],
        "response-headers": getHeaderSearchValues(response.headers),
        "response-body": [responseBody],
        "response-cookies": getHeaderSearchValues(response.cookies),
        status: [String(response.status), response.statusText || ""],
        server: [reqItem.serverIPAddress || ""],
        client: [reqItem.clientIPAddress || ""],
        highlight: [],
        interceptor: [],
        notes: [],
        console: [],
        response: responseValues,
        all: requestValues.concat(responseValues, entity.domain, entity.applicationLabel,
            entity.application == "__none__" ? "" : entity.application)
    };
}

function decodeResponseBody(responseContent, mimeType) {
    var text = responseContent.text || "";
    if (responseContent.encoding != "base64") {
        return text;
    }
    var binary = atob(text);
    var contentGroup = getContentGroup(mimeType);
    if (["image", "media", "binary"].includes(contentGroup) || typeof TextDecoder == "undefined") {
        return binary;
    }
    var charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(mimeType);
    var bytes = Uint8Array.from(binary, function (character) { return character.charCodeAt(0); });
    try {
        return new TextDecoder(charset ? charset[1] : "utf-8").decode(bytes);
    } catch (error) {
        return new TextDecoder("utf-8").decode(bytes);
    }
}

function matchesFilterGroups(filterValues, activeFilters) {
    for (var filterGroup in activeFilters) {
        if (!activeFilters[filterGroup].includes(filterValues[filterGroup])) {
            return false;
        }
    }
    return true;
}

function clampInspectorWidth(width, layoutWidth) {
    return Math.max(280, Math.min(Number(width) || 0, Math.max(280, Number(layoutWidth) - 280)));
}

function resizeAdjacentColumns(widths, columnIndex, delta, minimumWidths) {
    var resizedWidths = widths.slice();
    var leftMinimum = minimumWidths[columnIndex] || 40;
    var rightMinimum = minimumWidths[columnIndex + 1] || 40;
    var availableWidth = resizedWidths[columnIndex] + resizedWidths[columnIndex + 1];
    var nextLeftWidth = Math.max(leftMinimum, Math.min(resizedWidths[columnIndex] + delta, availableWidth - rightMinimum));
    resizedWidths[columnIndex] = nextLeftWidth;
    resizedWidths[columnIndex + 1] = availableWidth - nextLeftWidth;
    return resizedWidths;
}

function clampInspectorTableKeyWidth(width, tableWidth) {
    return Math.max(80, Math.min(Number(width) || 0, Math.max(80, Number(tableWidth) - 100)));
}

function getDisplayRequestId(entity) {
    return String((Number(entity && entity.index) || 0) + 1);
}

function toggleInspectorPanelState(state, panelName) {
    var requestExpanded = state.requestExpanded !== false;
    var responseExpanded = state.responseExpanded !== false;
    if (panelName == "request") {
        requestExpanded = !requestExpanded;
    } else if (panelName == "response") {
        responseExpanded = !responseExpanded;
    }
    if (!requestExpanded && !responseExpanded) {
        if (panelName == "request") {
            responseExpanded = true;
        } else {
            requestExpanded = true;
        }
    }
    return { requestExpanded: requestExpanded, responseExpanded: responseExpanded };
}

var inspectorPanelState = { requestExpanded: true, responseExpanded: true };

function applyInspectorPanelState() {
    var requestExpanded = inspectorPanelState.requestExpanded;
    var responseExpanded = inspectorPanelState.responseExpanded;
    $(".inspector-panel").each(function () {
        var panelName = $(this).attr("data-panel");
        var expanded = panelName == "request" ? requestExpanded : responseExpanded;
        var otherExpanded = panelName == "request" ? responseExpanded : requestExpanded;
        $(this).toggleClass("collapsed", !expanded);
        if (!expanded) {
            this.style.flex = "0 0 34px";
        } else if (!otherExpanded) {
            this.style.flex = "1 1 auto";
        } else {
            this.style.flex = "";
        }
        $(this).find(".inspector-panel-toggle")
            .attr("aria-expanded", String(expanded))
            .attr("aria-label", (expanded ? "收缩" : "展开") + (panelName == "request" ? "请求" : "响应") + "面板");
    });
}

function toggleInspectorPanel(panelName) {
    inspectorPanelState = toggleInspectorPanelState(inspectorPanelState, panelName);
    applyInspectorPanelState();
}

function getRawRequestTarget(url) {
    try {
        var parsedURL = new URL(url);
        return (parsedURL.pathname || "/") + (parsedURL.search || "");
    } catch (error) {
        return url || "/";
    }
}

function formatRawRequest(reqItem) {
    var request = reqItem && reqItem.request || {};
    var method = request.method || "GET";
    var version = request.httpVersion || "HTTP/1.1";
    var lines = [method + " " + getRawRequestTarget(request.url) + " " + version];
    var headers = Array.isArray(request.headers) ? request.headers : [];
    for (var i = 0; i < headers.length; i++) {
        lines.push(String(headers[i].name || "") + ": " + String(headers[i].value || ""));
    }
    var body = request.postData && request.postData.text || "";
    return lines.join("\n") + "\n\n" + body;
}

function formatRawResponse(reqItem, content) {
    var response = reqItem && reqItem.response || {};
    var request = reqItem && reqItem.request || {};
    var version = request.httpVersion || "HTTP/1.1";
    var status = response.status == null ? "" : response.status;
    var statusText = response.statusText || "";
    var lines = [version + " " + status + " " + statusText].filter(function (line) { return line.trim().length > 0; });
    var headers = Array.isArray(response.headers) ? response.headers : [];
    for (var i = 0; i < headers.length; i++) {
        lines.push(String(headers[i].name || "") + ": " + String(headers[i].value || ""));
    }
    return lines.join("\n") + "\n\n" + (content || "");
}

function formatHex(text) {
    var bytes = [];
    var source = String(text || "");
    for (var i = 0; i < source.length; i++) {
        var code = source.charCodeAt(i);
        if (code < 128) {
            bytes.push(code);
        } else {
            var encoded = unescape(encodeURIComponent(source.charAt(i)));
            for (var byteIndex = 0; byteIndex < encoded.length; byteIndex++) {
                bytes.push(encoded.charCodeAt(byteIndex));
            }
        }
    }
    var lines = [];
    for (var offset = 0; offset < bytes.length; offset += 16) {
        var lineBytes = bytes.slice(offset, offset + 16);
        lines.push(offset.toString(16).toUpperCase().padStart(4, "0") + "  " + lineBytes.map(function (byte) {
            return byte.toString(16).toUpperCase().padStart(2, "0");
        }).join(" "));
    }
    return lines.join("\n");
}

function renderRawViews() {
    $(".raw-view-tab").off().on("click", function () {
        var panel = $(this).closest(".inspector-panel");
        panel.find(".raw-view-tab").removeClass("selected");
        $(this).addClass("selected");
        panel.find(".raw-code").attr("data-raw-mode", $(this).attr("data-raw-mode"));
        renderRawViews();
    });
    if (!selectedReq) {
        return;
    }
    $(".raw-code").each(function () {
        var source = $(this).attr("data-raw-source");
        var raw = source == "request" ? selectedReq.rawRequest : selectedReq.rawResponse;
        var mode = $(this).attr("data-raw-mode") || "text";
        $(this).html((mode == "hex" ? formatHex(raw) : raw).toString().toHtmlEntities());
    });
}

function runSearch() {
    while (visibleIndicies.length > 0) {
        visibleIndicies.pop();
    }
    var selectedDomain = $(".domain-filter").val() || "";
    var selectedApplication = $(".application-filter").val() || "";
    var query = $(".search").val() || "";
    var searchMode = $(".search-mode").val() || "contains";
    var searchField = $(".search-field").val() || "all";
    var caseSensitive = $(".case-sensitive").attr("aria-pressed") == "true";
    var activeFilters = {};
    $(".quick-filter.selected").each(function () {
        var filter = $(this).attr("data-filter");
        if (filter != "all") {
            var group = $(this).closest("[data-filter-group]").attr("data-filter-group");
            if (!activeFilters[group]) {
                activeFilters[group] = [];
            }
            activeFilters[group].push(filter);
        }
    });

    var i = -1;
    $(".request-items .request-item").each(function () {
        i++;
        var entity = reqs[i];
        var filterValues = {
            protocol: entity.protocolGroup,
            "http-version": entity.httpVersionGroup,
            method: entity.methodGroup,
            content: entity.contentGroup,
            status: entity.statusGroup
        };
        if (selectedDomain && entity.domain != selectedDomain) {
            $(this).hide();
            return;
        }
        if (selectedApplication && entity.application != selectedApplication) {
            $(this).hide();
            return;
        }
        if (!matchesFilterGroups(filterValues, activeFilters)) {
            $(this).hide();
            return;
        }
        var searchValues = entity.searchValues[searchField] || entity.searchValues.all;
        if (query.length > 0 && !searchValues.some(function (value) { return matchesSearchText(value, query, searchMode, caseSensitive); })) {
            $(this).hide();
            return;
        }
        $(this).show();
        visibleIndicies.push(i);
    });
    if (selectedIndex >= 0 && !visibleIndicies.includes(selectedIndex)) {
        closeInspector();
    }
}

function handleRequestNavigation(event) {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        (event.key != "ArrowUp" && event.key != "ArrowDown") || visibleIndicies.length == 0 ||
        $(event.target).closest(".toolbar, .request-inspector, input, textarea, select, button, [contenteditable]:not([contenteditable='false']), [role='separator']").length > 0) {
        return;
    }
    event.preventDefault();
    var position = visibleIndicies.indexOf(selectedIndex);
    if (position < 0) {
        position = event.key == "ArrowDown" ? 0 : visibleIndicies.length - 1;
    } else {
        position = Math.max(0, Math.min(visibleIndicies.length - 1, position + (event.key == "ArrowDown" ? 1 : -1)));
    }
    selectReq(visibleIndicies[position]);
    var selectedItem = $(".request-items .request-item[index='" + selectedIndex + "']").get(0);
    if (selectedItem) {
        selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function closeInspector() {
    selectedReq = null;
    selectedIndex = -1;
    inspectorPanelState = { requestExpanded: true, responseExpanded: true };
    $(".main-layout").removeClass("has-inspector resizing");
    $(".request-inspector").removeClass("ready");
    $(".request-item.selected").removeClass("selected");
    var urlScroller = document.querySelector(".inspector-panel-url");
    if (urlScroller) {
        urlScroller.textContent = "";
        urlScroller.removeAttribute("title");
        urlScroller.scrollLeft = 0;
    }
    resetInspectorCopyButton();
    applyInspectorPanelState();
}

function setupInspectorURLScroller() {
    var scroller = document.querySelector(".inspector-panel-url");
    var copyButton = document.querySelector(".inspector-copy");
    if (!scroller || scroller.dataset.bound == "true") {
        return;
    }
    scroller.dataset.bound = "true";
    var dragging = false;
    var suppressClick = false;
    var startX = 0;
    var startScrollLeft = 0;

    scroller.addEventListener("pointerdown", function (event) {
        if (event.button != 0) {
            return;
        }
        dragging = true;
        suppressClick = false;
        startX = event.clientX;
        startScrollLeft = scroller.scrollLeft;
        scroller.classList.add("dragging");
        if (scroller.setPointerCapture) {
            scroller.setPointerCapture(event.pointerId);
        }
    });

    scroller.addEventListener("pointermove", function (event) {
        if (!dragging) {
            return;
        }
        var delta = event.clientX - startX;
        if (Math.abs(delta) > 2) {
            suppressClick = true;
            event.preventDefault();
        }
        scroller.scrollLeft = startScrollLeft - delta;
    });

    function finishDrag(event) {
        if (!dragging) {
            return;
        }
        dragging = false;
        scroller.classList.remove("dragging");
        if (scroller.hasPointerCapture && scroller.hasPointerCapture(event.pointerId)) {
            scroller.releasePointerCapture(event.pointerId);
        }
    }

    scroller.addEventListener("pointerup", finishDrag);
    scroller.addEventListener("pointercancel", finishDrag);
    scroller.addEventListener("click", function (event) {
        if (suppressClick) {
            event.preventDefault();
            suppressClick = false;
        }
    });
    if (copyButton) {
        copyButton.addEventListener("click", function (event) {
            if (!selectedReq || !selectedReq.fullURL) {
                return;
            }
            event.preventDefault();
            var clientX = event.clientX;
            var clientY = event.clientY;
            if (clientX === 0 && clientY === 0) {
                var buttonRect = copyButton.getBoundingClientRect();
                clientX = buttonRect.left + buttonRect.width / 2;
                clientY = buttonRect.top + buttonRect.height / 2;
            }
            vscode.postMessage({
                action: "copyRequestUrl",
                text: selectedReq.fullURL,
                clientX: clientX,
                clientY: clientY
            });
        });
    }
    scroller.addEventListener("wheel", function (event) {
        if (scroller.scrollWidth <= scroller.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
            return;
        }
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
    }, { passive: false });
    scroller.addEventListener("keydown", function (event) {
        if (event.key == "ArrowLeft") {
            scroller.scrollLeft -= 40;
        } else if (event.key == "ArrowRight") {
            scroller.scrollLeft += 40;
        } else if (event.key == "Home") {
            scroller.scrollLeft = 0;
        } else if (event.key == "End") {
            scroller.scrollLeft = scroller.scrollWidth;
        } else {
            return;
        }
        event.preventDefault();
    });
}

var copyToastTimer;
var copyButtonResetTimer;

function resetInspectorCopyButton() {
    var button = document.querySelector(".inspector-copy");
    if (!button) {
        return;
    }
    var icon = button.querySelector(".codicon");
    button.classList.remove("copied");
    button.setAttribute("aria-label", "复制请求 URL");
    button.setAttribute("title", "复制请求 URL");
    if (icon) {
        icon.classList.remove("codicon-check");
        icon.classList.add("codicon-copy");
    }
}

function showInspectorCopyResult(success) {
    clearTimeout(copyButtonResetTimer);
    resetInspectorCopyButton();
    if (success === false) {
        return;
    }
    var button = document.querySelector(".inspector-copy");
    if (!button) {
        return;
    }
    var icon = button.querySelector(".codicon");
    button.classList.add("copied");
    button.setAttribute("aria-label", "请求 URL 已复制");
    button.setAttribute("title", "请求 URL 已复制");
    if (icon) {
        icon.classList.remove("codicon-copy");
        icon.classList.add("codicon-check");
    }
    copyButtonResetTimer = setTimeout(resetInspectorCopyButton, 1600);
}

function showCopyToastAt(clientX, clientY, success) {
    var toast = document.querySelector(".copy-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.className = "copy-toast";
        toast.setAttribute("role", "status");
        document.body.appendChild(toast);
    }

    toast.textContent = success === false ? "请求 URL 复制失败" : "请求 URL 已复制";
    toast.classList.toggle("error", success === false);
    toast.classList.remove("visible");

    var anchorX = Number.isFinite(clientX) ? clientX : window.innerWidth / 2;
    var anchorY = Number.isFinite(clientY) ? clientY : window.innerHeight / 2;
    var gap = 12;
    var margin = 8;
    var left = Math.max(margin, Math.min(anchorX + gap, window.innerWidth - toast.offsetWidth - margin));
    var top = anchorY + gap;
    if (top + toast.offsetHeight > window.innerHeight - margin) {
        top = Math.max(margin, anchorY - toast.offsetHeight - gap);
    }
    toast.style.left = left + "px";
    toast.style.top = top + "px";
    toast.classList.add("visible");

    clearTimeout(copyToastTimer);
    copyToastTimer = setTimeout(function () {
        toast.classList.remove("visible");
    }, 1600);
}

function setupInspectorResizer() {
    var splitter = document.querySelector(".inspector-splitter");
    if (!splitter || splitter.dataset.bound == "true") {
        return;
    }
    splitter.dataset.bound = "true";

    function updateWidth(layout, width) {
        var clampedWidth = clampInspectorWidth(width, layout.getBoundingClientRect().width);
        layout.style.setProperty("--inspector-width", clampedWidth + "px");
        splitter.setAttribute("aria-valuenow", Math.round(clampedWidth));
    }

    splitter.addEventListener("pointerdown", function (event) {
        var layout = document.querySelector(".main-layout");
        var inspector = document.querySelector(".request-inspector");
        if (!layout || !inspector) {
            return;
        }
        event.preventDefault();
        var startX = event.clientX;
        var startWidth = inspector.getBoundingClientRect().width;
        layout.classList.add("resizing");

        function handleMove(moveEvent) {
            updateWidth(layout, startWidth + startX - moveEvent.clientX);
        }

        function handleUp() {
            layout.classList.remove("resizing");
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        }

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
    });

    splitter.addEventListener("keydown", function (event) {
        if (event.key != "ArrowLeft" && event.key != "ArrowRight") {
            return;
        }
        var layout = document.querySelector(".main-layout");
        var inspector = document.querySelector(".request-inspector");
        if (!layout || !inspector) {
            return;
        }
        event.preventDefault();
        var direction = event.key == "ArrowLeft" ? 20 : -20;
        updateWidth(layout, inspector.getBoundingClientRect().width + direction);
    });

    var horizontalSplitter = document.querySelector(".inspector-horizontal-splitter");
    if (!horizontalSplitter || horizontalSplitter.dataset.bound == "true") {
        return;
    }
    horizontalSplitter.dataset.bound = "true";

    horizontalSplitter.addEventListener("pointerdown", function (event) {
        var panels = document.querySelector(".inspector-panels");
        var requestPanel = document.querySelector(".request-panel");
        var responsePanel = document.querySelector(".response-panel");
        if (!panels || !requestPanel || !responsePanel || requestPanel.classList.contains("collapsed") || responsePanel.classList.contains("collapsed")) {
            return;
        }
        event.preventDefault();
        var startY = event.clientY;
        var startRequestHeight = requestPanel.getBoundingClientRect().height;

        function updatePanelHeights(moveEvent) {
            var availableHeight = panels.getBoundingClientRect().height - horizontalSplitter.getBoundingClientRect().height;
            var nextRequestHeight = Math.max(62, Math.min(startRequestHeight + moveEvent.clientY - startY, Math.max(62, availableHeight - 62)));
            requestPanel.style.flex = "0 0 " + nextRequestHeight + "px";
            responsePanel.style.flex = "1 1 auto";
        }

        function handleMove(moveEvent) {
            updatePanelHeights(moveEvent);
        }

        function handleUp() {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        }

        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
    });

    horizontalSplitter.addEventListener("keydown", function (event) {
        if (event.key != "ArrowUp" && event.key != "ArrowDown") {
            return;
        }
        var panels = document.querySelector(".inspector-panels");
        var requestPanel = document.querySelector(".request-panel");
        var responsePanel = document.querySelector(".response-panel");
        if (!panels || !requestPanel || !responsePanel || requestPanel.classList.contains("collapsed") || responsePanel.classList.contains("collapsed")) {
            return;
        }
        event.preventDefault();
        var delta = event.key == "ArrowUp" ? -20 : 20;
        var nextRequestHeight = requestPanel.getBoundingClientRect().height + delta;
        var availableHeight = panels.getBoundingClientRect().height - horizontalSplitter.getBoundingClientRect().height;
        requestPanel.style.flex = "0 0 " + Math.max(62, Math.min(nextRequestHeight, Math.max(62, availableHeight - 62))) + "px";
        responsePanel.style.flex = "1 1 auto";
    });
}

function setupRequestColumnResizers() {
    var header = document.querySelector(".request-list-header");
    var layout = document.querySelector(".main-layout");
    if (!header || !layout) {
        return;
    }
    var minimumWidths = [42, 90, 60, 160, 60, 54];

    function getColumnWidths() {
        return Array.from(header.children).map(function (cell) {
            return cell.getBoundingClientRect().width;
        });
    }

    function applyColumnWidths(widths) {
        var roundedWidths = widths.map(function (width) {
            return Math.round(width * 10) / 10;
        });
        layout.style.setProperty("--request-grid-columns", roundedWidths.map(function (width) {
            return width + "px";
        }).join(" "));
        layout.style.setProperty("--request-grid-min-width", roundedWidths.reduce(function (total, width) {
            return total + width;
        }, 0) + "px");
    }

    document.querySelectorAll(".request-column-resizer").forEach(function (resizer) {
        if (resizer.dataset.bound == "true") {
            return;
        }
        resizer.dataset.bound = "true";
        var columnIndex = Number(resizer.dataset.columnIndex);

        resizer.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            event.stopPropagation();
            var startX = event.clientX;
            var startWidths = getColumnWidths();
            document.body.classList.add("resizing-columns");

            function handleMove(moveEvent) {
                applyColumnWidths(resizeAdjacentColumns(startWidths, columnIndex, moveEvent.clientX - startX, minimumWidths));
            }

            function handleUp() {
                document.body.classList.remove("resizing-columns");
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            }

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
        });

        resizer.addEventListener("keydown", function (event) {
            if (event.key != "ArrowLeft" && event.key != "ArrowRight") {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            applyColumnWidths(resizeAdjacentColumns(getColumnWidths(), columnIndex, event.key == "ArrowLeft" ? -12 : 12, minimumWidths));
        });
    });
}

function setupDataTableColumnResizers() {
    var inspector = document.querySelector(".request-inspector");
    if (!inspector) {
        return;
    }
    document.querySelectorAll("[data-table]").forEach(function (table) {
        var resizer = document.createElement("div");
        resizer.className = "data-table-column-resizer";
        resizer.setAttribute("role", "separator");
        resizer.setAttribute("aria-label", "调整 Inspector 表格列宽");
        resizer.setAttribute("aria-orientation", "vertical");
        resizer.setAttribute("tabindex", "0");
        table.appendChild(resizer);

        function applyKeyWidth(width) {
            var nextWidth = clampInspectorTableKeyWidth(width, table.getBoundingClientRect().width);
            inspector.style.setProperty("--inspector-key-width", nextWidth + "px");
            resizer.setAttribute("aria-valuenow", Math.round(nextWidth));
        }

        resizer.addEventListener("pointerdown", function (event) {
            event.preventDefault();
            event.stopPropagation();
            var tableRect = table.getBoundingClientRect();
            var startX = event.clientX;
            var startWidth = resizer.getBoundingClientRect().left - tableRect.left;
            document.body.classList.add("resizing-columns");

            function handleMove(moveEvent) {
                applyKeyWidth(startWidth + moveEvent.clientX - startX);
            }

            function handleUp() {
                document.body.classList.remove("resizing-columns");
                window.removeEventListener("pointermove", handleMove);
                window.removeEventListener("pointerup", handleUp);
            }

            window.addEventListener("pointermove", handleMove);
            window.addEventListener("pointerup", handleUp);
        });

        resizer.addEventListener("keydown", function (event) {
            if (event.key != "ArrowLeft" && event.key != "ArrowRight") {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            var tableRect = table.getBoundingClientRect();
            var currentWidth = resizer.getBoundingClientRect().left - tableRect.left;
            applyKeyWidth(currentWidth + (event.key == "ArrowLeft" ? -12 : 12));
        });
    });
}

function populateFilterOptions(entries) {
    var domains = Object.create(null);
    var applications = Object.create(null);
    var hasUnlabeledApplication = false;
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var domain = getRequestDomain(entry.request && entry.request.url);
        if (domain) {
            domains[domain] = true;
        }
        var application = getApplicationInfo(entry);
        if (application.key == "__none__") {
            hasUnlabeledApplication = true;
        } else {
            applications[application.key] = application.label;
        }
    }

    var domainSelect = $(".domain-filter").empty().append($("<option>").attr("value", "").text("全部"));
    Object.keys(domains).sort().forEach(function (domain) {
        domainSelect.append($("<option>").attr("value", domain).text(domain));
    });

    var applicationSelect = $(".application-filter").empty().append($("<option>").attr("value", "").text("全部"));
    Object.keys(applications).sort(function (left, right) {
        return applications[left].localeCompare(applications[right]);
    }).forEach(function (key) {
        applicationSelect.append($("<option>").attr("value", key).text(applications[key]));
    });
    if (hasUnlabeledApplication) {
        applicationSelect.append($("<option>").attr("value", "__none__").text("未标注"));
    }
}

function setupGUI() {
    $(".inspector-panel").each(function () {
        var panel = $(this);
        var tabGroup = panel.find(".tab-group");
        tabGroup.html("");
        panel.find(".page:not([disabled])").each(function () {
            tabGroup.append("<div class='tab' name='" + $(this).attr("name") + "'>" + $(this).attr("name") + "</div>");
        });
        tabGroup.find(".tab").first().addClass("selected");
        panel.find(".page").first().addClass("show");
    });

    $(".tab").off().on("click", function () {
        var panel = $(this).closest(".inspector-panel");
        panel.find(".tab").removeClass("selected");
        $(this).addClass("selected");
        panel.find(".page").removeClass("show");
        panel.find(".page[name='" + $(this).attr("name") + "']").addClass("show");
    });

    $(".inspector-panel-toggle").off().on("click", function () {
        toggleInspectorPanel($(this).closest(".inspector-panel").attr("data-panel"));
    });

    applyInspectorPanelState();
    renderRawViews();

    $(".quick-filter").off().on("click", function () {
        var filter = $(this).attr("data-filter");
        if (filter == "all") {
            $(".quick-filter").removeClass("selected");
            $(this).addClass("selected");
        } else {
            $(".quick-filter[data-filter='all']").removeClass("selected");
            $(this).toggleClass("selected");
            if ($(".quick-filter.selected").length == 0) {
                $(".quick-filter[data-filter='all']").addClass("selected");
            }
        }
        runSearch();
    });

    $(".domain-filter,.application-filter,.search-field,.search-mode").off().on("change", runSearch);
    $(".search").off().on("input", runSearch);
    $(".case-sensitive").off().on("click", function () {
        var enabled = $(this).attr("aria-pressed") != "true";
        $(this).attr("aria-pressed", enabled ? "true" : "false").toggleClass("selected", enabled);
        runSearch();
    });
    $(".clear-search").off().on("click", function () {
        $(".search").val("");
        runSearch();
        $(".search").focus();
    });
    $(".inspector-close").off().on("click", closeInspector);

    $(".request-items .request-item").off()
        .on("click", function () {
            var index = Number($(this).attr("index"));
            if ($(".main-layout").hasClass("has-inspector")) {
                selectReq(index);
                return;
            }
            selectedIndex = index;
            $(".request-item.selected").removeClass("selected");
            $(this).addClass("selected");
        })
        .on("dblclick", function () {
            selectReq(Number($(this).attr("index")));
        });

    setupInspectorResizer();
    setupInspectorURLScroller();
    setupRequestColumnResizers();

    document.removeEventListener('keydown', handleRequestNavigation);
    document.addEventListener('keydown', handleRequestNavigation);
    runSearch();
}

function getNested(path) {
    var args = path.split('.');
    var obj = selectedReq;

    for (var i = 0; i < args.length; i++) {
        if (!obj || !obj.hasOwnProperty(args[i])) {
            return "";
        }
        obj = obj[args[i]];
    }
    return obj;
}

function round(num, place) {
    return +(Math.round(num + "e+" + place) + "e-" + place);
}

function selectReq(index) {
    if (!reqs[index]) {
        return;
    }
    selectedIndex = index;
    selectedReq = reqs[index];
    $(".main-layout").addClass("has-inspector");
    $(".request-inspector").addClass("ready");
    $(".request-item.selected").removeClass("selected");
    $(".request-item[index='" + index + "']").addClass("selected");
    $(".inspector-method-badge").attr("type", selectedReq.method);
    resetInspectorCopyButton();
    $(".inspector-panel-url").attr("title", selectedReq.fullURL);
    $("*[data]:not([round])").each(function () {
        var value = getNested($(this).attr("data"));
        $(this).text(value == null ? "" : String(value));
    });
    var urlScroller = document.querySelector(".inspector-panel-url");
    if (urlScroller) {
        urlScroller.scrollLeft = 0;
    }
    renderRawViews();
    renderJSONBodyViews();
    $("*[data][round]").each(function () {
        $(this).text(round(getNested($(this).attr("data")), $(this).attr("round")));
    });
    $(".inspector-timing-bars").attr("totalTime", 0);
    $(".inspector-timing-bars .data-bar").each(function () {
        if ($(this).html() > 0) {
            $(this).parent().attr("totalTime", (+$(this).parent().attr("totalTime")) + (+$(this).html()));
        }
        $(this).attr("time", $(this).html());
        $(this).html("");
    });
    var current = 0;
    $(".inspector-timing-bars .data-bar").each(function () {
        var total = +$(this).parent().attr("totalTime");
        var time = +$(this).attr("time");
        if (time > 0) {
            $(this).attr("style", "width:" + ((time / total) * 100) + "%;margin-left:" + ((current / total) * 100) + "%;");
            current += time;
        } else {
            $(this).attr("style", "");
        }
    });
    $("*[data-table]").html("");
    $("*[data-table]").each(function () {
        var table = getNested($(this).attr("data-table"));
        for (var tableIndex in table) {
            var tableItem = table[tableIndex];
            if (!(tableItem === undefined) && !(tableItem.value === undefined)) {
                $(this).append(`<div class="data-row"><div class="data-key">` + tableItem.name.toString().toHtmlEntities() + `</div><div class="data-value">` + tableItem.value.toString().toHtmlEntities() + `</div></div>`);
            }
        }
    });
    setupDataTableColumnResizers();
    $("*[require-data]").each(function () {
        var table = getNested($(this).attr("require-data"));
        if (table.length == 0) {
            $(this).hide();
        } else {
            $(this).show();
        }
    });

    $("*[require-value]").each(function () {
        var components = $(this).attr("require-value").split("=");
        var value = getNested(components[0]);
        if (new RegExp(components[1]).test(value)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });

    $("*[data-to]").each(function () {
        if (typeof $(this).attr("require-value") !== 'undefined' && $(this).attr("require-value") !== false) {
            var components = $(this).attr("require-value").split("=");
            var value = getNested(components[0]);
            if (!new RegExp(components[1]).test(value)) {
                return;
            }
        }
        var components = $(this).attr("data-to").split("=");
        var value = getNested(components[1]);
        $(this).attr(components[0], value);
    });

    $(".code-block.shorten").each(function () {
        $(this).scrollTop(0);
        if (selectedReq.formatted) {
            $(this).addClass("formatted");
        } else {
            $(this).removeClass("formatted");
        }
        // if(selectedReq != null && selectedReq.content.length > 10000){
        //     $(this).addClass("collapsable").addClass("collapsed");
        //     $(this).html(selectedReq.contentShort);
        // }else{
        //     $(this).removeClass("collapsable").removeClass("collapsed");
        //     $(this).html(selectedReq.content);
        // }
        $(this).html(selectedReq.contentShort.toString().toHtmlEntities());
    });

    $(".open-new-tab").off().on("dblclick", function () {
        var source = $(this).attr("data-open-source") || "response";
        var text = source == "request" ? selectedReq.requestBodyRaw : selectedReq.responseBodyRaw;
        var mime = source == "request" ? selectedReq.requestBodyMime : selectedReq.mimeType;
        vscode.postMessage({
            action: "openNewTab",
            text: text || "",
            lang: String(mime || "text/plain").split(";", 1)[0].split("/", 2)[1] || "text",
            json: isJSONMimeType(mime)
        });
    });

    $(".stack").html("");
    if (selectedReq.obj._initiator?.type == "script") {
        for (var i = 0; i < selectedReq.obj._initiator.stack.callFrames.length; i++) {
            var frame = selectedReq.obj._initiator.stack.callFrames[i];
            const re = new RegExp('(?:.+\/)([^\/?]+)', 'gm');
            var URLMatch = re.exec(frame.url);
            var file = URLMatch == null ? "" : URLMatch[1];
            $(".stack").append(`<tr>
                <td class="stack-frame-function">`+ (frame.functionName.length == 0 ? "(anonymous)" : frame.functionName) + `</td>
                <td class="stack-frame-sID">`+ frame.scriptId + `</td>
                <td class="stack-frame-location">(`+ frame.lineNumber + ":" + frame.columnNumber + `)</td>
                <td class="stack-frame-file"><div>`+ file + `</div></td>
            </tr>`);
        }
    }

    $(".request-inspector").addClass("ready");
}

function toggleBlockCollapse(block) {
    if (block.hasClass("collapsed")) {
        block.removeClass("collapsed");
        $(block).html(getNested($(block).attr("data")).toString().toHtmlEntities());
    } else {
        block.addClass("collapsed");
        $(block).html(getNested($(block).attr("data") + "Short").toString().toHtmlEntities());
    }
}

function formatXML(input, indent) {
    indent = indent || '\t'; //you can set/define other ident than tabs


    //PART 1: Add \n where necessary
    xmlString = input.replace(/^\s+|\s+$/g, '');  //trim it (just in case) {method trim() not working in IE8}

    xmlString = input
        .replace(/(<([a-zA-Z]+\b)[^>]*>)(?!<\/\2>|[\w\s])/g, "$1\n") //add \n after tag if not followed by the closing tag of pair or text node
        .replace(/(<\/[a-zA-Z]+[^>]*>)/g, "$1\n") //add \n after closing tag
        .replace(/>\s+(.+?)\s+<(?!\/)/g, ">\n$1\n<") //add \n between sets of angled brackets and text node between them
        .replace(/>(.+?)<([a-zA-Z])/g, ">\n$1\n<$2") //add \n between angled brackets and text node between them
        .replace(/\?></, "?>\n<") //detect a header of XML

    xmlArr = xmlString.split('\n');  //split it into an array (for analise each line separately)



    //PART 2: indent each line appropriately

    var tabs = '';  //store the current indentation
    var start = 0;  //starting line

    if (/^<[?]xml/.test(xmlArr[0])) start++;  //if the first line is a header, ignore it

    for (var i = start; i < xmlArr.length; i++) //for each line
    {
        var line = xmlArr[i].replace(/^\s+|\s+$/g, '');  //trim it (just in case)

        if (/^<[/]/.test(line))  //if the line is a closing tag
        {
            tabs = tabs.replace(indent, '');  //remove one indent from the store
            xmlArr[i] = tabs + line;  //add the tabs at the beginning of the line
        }
        else if (/<.*>.*<\/.*>|<.*[^>]\/>/.test(line))  //if the line contains an entire node
        {
            //leave the store as is
            xmlArr[i] = tabs + line; //add the tabs at the beginning of the line
        }
        else if (/<.*>/.test(line)) //if the line starts with an opening tag and does not contain an entire node
        {
            xmlArr[i] = tabs + line;  //add the tabs at the beginning of the line
            tabs += indent;  //and add one indent to the store
        }
        else  //if the line contain a text node
        {
            xmlArr[i] = tabs + line;  // add the tabs at the beginning of the line
        }
    }


    //PART 3: return formatted string (source)
    return xmlArr.join('\n');  //rejoin the array to a string and return it
}

function formatJSON(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 4);
    } catch (e) {
        return text;
    }
}

function format(text, mimeType) {
    var normalizedMimeType = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
    if (normalizedMimeType == "text/html" || normalizedMimeType == "text/xml" || normalizedMimeType == "application/xhtml+xml") {
        return formatXML(text);
    } else if (normalizedMimeType == "application/json" || normalizedMimeType.endsWith("+json")) {
        return formatJSON(text);
    } else {
        return text;
    }
}

function isJSONMimeType(mimeType) {
    var normalized = String(mimeType || "").toLowerCase().split(";", 1)[0].trim();
    return normalized == "application/json" || normalized.endsWith("+json");
}

function renderJSONNode(value, label) {
    var isObject = value !== null && typeof value == "object";
    var row = document.createElement("div");
    row.className = "json-node";
    if (!isObject) {
        var leaf = document.createElement("span");
        leaf.className = "json-leaf";
        leaf.textContent = (label != null ? label + ": " : "") + (value === null ? "null" : String(value));
        row.appendChild(leaf);
        return row;
    }
    var details = document.createElement("details");
    details.open = true;
    var summary = document.createElement("summary");
    summary.textContent = (label != null ? label + ": " : "") + (Array.isArray(value) ? "[ ]" : "{ }");
    details.appendChild(summary);
    Object.keys(value).forEach(function (key) {
        details.appendChild(renderJSONNode(value[key], key));
    });
    row.appendChild(details);
    return row;
}

var jsonEditors = { request: null, response: null };

function renderJSONBodyViews() {
    $(".json-body-viewer").each(function () {
        var viewer = this;
        var source = viewer.getAttribute("data-json-source");
        var raw = source == "request" ? selectedReq && selectedReq.requestBodyRaw : selectedReq && selectedReq.responseBodyRaw;
        var mime = source == "request" ? selectedReq && selectedReq.requestBodyMime : selectedReq && selectedReq.mimeType;
        if (jsonEditors[source]) {
            jsonEditors[source].destroy();
            jsonEditors[source] = null;
        }
        viewer.innerHTML = "";
        viewer.hidden = true;
        var textBlock = source == "request" ? document.querySelector(".request-body-text") : document.querySelector(".response-panel .code-block.shorten");
        var isText = String(mime || "").toLowerCase().split(";", 1)[0].trim().startsWith("text/");
        var isJson = isJSONMimeType(mime);
        if (selectedReq && raw && (isJson || isText) && typeof JSONEditor == "function") {
            var options = {
                mode: isJson ? "tree" : "text",
                modes: isJson ? ["tree", "code", "text"] : ["text"],
                navigationBar: true,
                statusBar: true,
                onEditable: function () { return false; }
            };
            try {
                jsonEditors[source] = new JSONEditor(viewer, options);
                if (isJson) {
                    jsonEditors[source].set(JSON.parse(raw));
                } else {
                    jsonEditors[source].setText(raw);
                }
                viewer.hidden = false;
                if (textBlock) textBlock.hidden = true;
            } catch (error) {
                if (jsonEditors[source]) { jsonEditors[source].destroy(); jsonEditors[source] = null; }
            }
        }
        if (textBlock && viewer.hidden) textBlock.hidden = false;
    });
}

async function loadHARByURL(harURL) {
    try {
        const response = await fetch(harURL);
        if (!response.ok) {
            throw new Error(`Unable to read HAR file (${response.status})`);
        }
        loadHAR(await response.text());
    } catch (error) {
        showLoadError(error);
    }
}

function loadHAR(harText) {
    try {
        har = JSON.parse(harText);
        if (!har.log || !Array.isArray(har.log.entries)) {
            throw new Error("The HAR file does not contain a valid log.entries array.");
        }
    } catch (error) {
        showLoadError(error instanceof SyntaxError ? new Error("The HAR file is not valid JSON.") : error);
        return;
    }
    reqs.length = 0;
    visibleIndicies.length = 0;
    closeInspector();
    $(".request-items").empty();
    populateFilterOptions(har.log.entries);
    for (var i = 0; i < har.log.entries.length; i++) {
        addRequestItem(har.log.entries[i]);
    }
    setupGUI();
    $(".item-loader").addClass("hide");
}

function showLoadError(error) {
    $(".item-loader").addClass("hide");
    $(".request-items").empty().append($("<div>").addClass("load-error").text(error.message));
    console.error(error);
}

function addRequestItem(reqItem) {
    var endpointRegEx = new RegExp("^[^:]*:\/\/([^/]*)([^?]*)");
    var endpointComponents = endpointRegEx.exec(reqItem.request.url);
    var mimeType = reqItem.response.content.mimeType || getHeaderValue(reqItem.response.headers, "content-type") || "text/plain";
    var application = getApplicationInfo(reqItem);
    var domain = getRequestDomain(reqItem.request.url);
    var endpoint = endpointComponents ? endpointComponents[2] : reqItem.request.url;
    var requestHeaders = Array.isArray(reqItem.request.headers) ? reqItem.request.headers : [];
    var referer = "";
    for (var i = 0; i < requestHeaders.length; i++) {
        if (String(requestHeaders[i].name || "").toLowerCase() == "referer") {
            referer = requestHeaders[i].value;
        }
    }
    var content = "";
    var formatted = false;
    var responseBody = decodeResponseBody(reqItem.response.content, mimeType);
    var requestPostData = reqItem.request.postData || {};
    var requestBody = format(requestPostData.text || "", requestPostData.mimeType || getHeaderValue(reqItem.request.headers, "content-type"));
    if (reqItem.response.content.text != null) {
        content = responseBody;
        if (mimeType != "text/plain") {
            if (mimeType.includes("image/")) {
                content = "data:" + mimeType.split("/")[1] + ";base64," + reqItem.response.content.text;
            } else {
                formatted = true;
            }
        }
        content = format(content, mimeType);
    }
    var item = {
        "method": reqItem.request.method,
        "time": reqItem.time,
        "fullURL": reqItem.request.url,
        "domain": domain,
        "endpoint": endpoint,
        "application": application.key,
        "applicationLabel": application.label,
        "httpVersion": reqItem.request.httpVersion || reqItem.response.httpVersion || "HTTP/1.1",
        "referer": referer,
        "status": reqItem.response.status + " " + reqItem.response.statusText,
        "index": reqs.length,
        "content": content,
        "requestBody": requestBody,
        "requestBodyRaw": requestPostData.text || "",
        "requestBodyMime": requestPostData.mimeType || getHeaderValue(reqItem.request.headers, "content-type") || "",
        "responseBodyRaw": responseBody,
        "contentShort": content.substring(0, 5000),
        "mimeType": mimeType,
        "formatted": formatted,
        "protocolGroup": getProtocolGroup(reqItem.request.url, reqItem),
        "httpVersionGroup": getHttpVersionGroup(reqItem),
        "methodGroup": getMethodGroup(reqItem.request.method),
        "contentGroup": getContentGroup(mimeType),
        "statusGroup": getStatusGroup(reqItem.response.status),
        "rawRequest": formatRawRequest(reqItem),
        "rawResponse": formatRawResponse(reqItem, content),
        "obj": reqItem
    };
    item.searchValues = createSearchValues(reqItem, item, responseBody);
    reqs.push(item);
    addRequestGUIItem(item);
}

function addRequestGUIItem(entity) {
    var newItem = $(".templates .request-item").first().clone();
    newItem.attr("type", entity.obj.request.method);
    newItem.attr("reqType", entity.obj._resourceType);
    newItem.attr("time", entity.obj.time);
    newItem.attr("endpoint", entity.endpoint);
    newItem.attr("fullURL", entity.fullURL);
    newItem.attr("domain", entity.domain);
    newItem.attr("application", entity.application);
    newItem.attr("protocol", entity.protocolGroup);
    newItem.attr("http-version", entity.httpVersionGroup);
    newItem.attr("method-group", entity.methodGroup);
    newItem.attr("content", entity.contentGroup);
    newItem.attr("status-group", entity.statusGroup);
    newItem.attr("status", entity.obj.response.status);
    newItem.attr("index", entity.index);
    if (entity.obj.response.status !== 200) {
        if (entity.obj.response.status >= 400) {
            newItem.attr("highlight", "red");
        } else {
            newItem.attr("highlight", "yellow");
        }
    }
    newItem.attr("index", entity.index);
    newItem.find(".time").text(Math.round(entity.obj.time) + "ms");
    newItem.find(".status").attr("status", entity.obj.response.status);
    newItem.find(".request-id").text(getDisplayRequestId(entity));
    newItem.find(".application").text(entity.applicationLabel).attr("title", entity.applicationLabel);
    if (entity.method.length > 4) {
        switch (entity.method) {
            case "DELETE":
                newItem.find(".method").text("DLTE");
                break;
            case "OPTIONS":
                newItem.find(".method").text("OPNS");
                break;
            default:
                newItem.find(".method").text(entity.method);
                break;
        }
    } else {
        newItem.find(".method").text(entity.method);
    }
    newItem.find(".request-url").text(entity.fullURL).attr("title", entity.fullURL);
    newItem.appendTo(".request-items");
}

window.addEventListener('message', event => {

    const message = event.data; // The JSON data our extension sent

    if (message.command === 'copyRequestUrlResult') {
        showInspectorCopyResult(message.success);
        showCopyToastAt(message.clientX, message.clientY, message.success);
        return;
    }

    if (message.command === 'loadError') {
        showLoadError(new Error(message.message));
        return;
    }
});

$(document).ready(function () {
    if (window.harSource) {
        loadHARByURL(window.harSource);
    } else {
        showLoadError(new Error("No HAR file was provided to the analyzer."));
    }
});

String.prototype.toHtmlEntities = function () {
    return this.replace(/./gm, function (s) {
        // return "&#" + s.charCodeAt(0) + ";";
        return (s.match(/[a-z0-9\s]+/i)) ? s : "&#" + s.charCodeAt(0) + ";";
    });
};

String.fromHtmlEntities = function (string) {
    return (string + "").replace(/&#\d+;/gm, function (s) {
        return String.fromCharCode(s.match(/\d+/gm)[0]);
    })
};
