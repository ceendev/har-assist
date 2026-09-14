const fs = require('fs');
const vscode = require('vscode');

const VIEW_TYPE = 'har-assist.editor';

class HarCustomEditorProvider {
	constructor(context) {
		this.context = context;
	}

	openCustomDocument(uri) {
		return createHarDocument(uri);
	}

	async resolveCustomEditor(document, webviewPanel) {
		const markupPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'analyzer.html');
		const markup = await fs.promises.readFile(markupPath.fsPath, 'utf8');
		renderHarEditor(webviewPanel, document, {
			extensionUri: this.context.extensionUri,
			subscriptions: this.context.subscriptions,
			markup
		});
	}
}

function createHarDocument(uri) {
	return {
		uri,
		sourceUri: uri,
		dispose() {}
	};
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	const provider = new HarCustomEditorProvider(context);
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
			supportsMultipleEditorsPerDocument: false,
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);

	const openCommand = vscode.commands.registerCommand('har-assist.open', async function () {
		if (vscode.window.activeTextEditor == null) {
			vscode.window.showErrorMessage('Open a HAR file before running Har Assist.');
			return;
		}

		await vscode.commands.executeCommand(
			'vscode.openWith',
			vscode.window.activeTextEditor.document.uri,
			VIEW_TYPE
		);
	});

	context.subscriptions.push(openCommand);
}

function deactivate() {}

function renderHarEditor(panel, document, context) {
	const cssPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css');
	const codiconsPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
	const jqueryPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'jquery.min.js');
	const scriptPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'script.js');
	const jsonEditorCssPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'jsoneditor', 'dist', 'jsoneditor.min.css');
	const jsonEditorScriptPath = vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'jsoneditor', 'dist', 'jsoneditor.min.js');
	const bodyViewerPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'body-viewer.js');
	const bodyViewerCssPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'body-viewer.css');
	const harUri = panel.webview.asWebviewUri(document.sourceUri);
	const resourceRoots = [context.extensionUri, vscode.Uri.joinPath(document.sourceUri, '..')];

	panel.webview.options = {
		enableScripts: true,
		localResourceRoots: resourceRoots
	};
	panel.webview.html = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link rel="stylesheet" href="${panel.webview.asWebviewUri(jsonEditorCssPath)}">
			<link rel="stylesheet" href="${panel.webview.asWebviewUri(bodyViewerCssPath)}">
			<link rel="stylesheet" href="${panel.webview.asWebviewUri(cssPath)}">
			<link href="${panel.webview.asWebviewUri(codiconsPath)}" rel="stylesheet" />
		</head>
		<body>
			<script>window.harSource = ${JSON.stringify(harUri.toString())};</script>
			<script src="${panel.webview.asWebviewUri(jqueryPath)}"></script>
			<script src="${panel.webview.asWebviewUri(jsonEditorScriptPath)}"></script>
			<script src="${panel.webview.asWebviewUri(bodyViewerPath)}"></script>
			<script src="${panel.webview.asWebviewUri(scriptPath)}"></script>
			${context.markup}
		</body>
		</html>`;

	panel.webview.onDidReceiveMessage(async message => {
		if (message.action === 'openNewTab' && typeof message.text === 'string') {
			openBodyEditor(context, message.text, message.mimeType || (message.json ? 'application/json' : 'text/plain'), message.source);
			return;
		}

		if (message.action === 'copyRequestUrl' && typeof message.text === 'string' && message.text.length > 0) {
			let success = true;
			try {
				await vscode.env.clipboard.writeText(message.text);
			} catch {
				success = false;
			}
			await panel.webview.postMessage({
				command: 'copyRequestUrlResult',
				success,
				clientX: Number.isFinite(message.clientX) ? message.clientX : 0,
				clientY: Number.isFinite(message.clientY) ? message.clientY : 0
			});
		}
	}, undefined, context.subscriptions);
}

function openBodyEditor(context, text, mimeType, source) {
	const panel = vscode.window.createWebviewPanel('har-assist.body', source === 'request' ? 'HAR 请求体' : 'HAR 响应体', vscode.ViewColumn.Beside, {
		enableScripts: true,
		retainContextWhenHidden: true,
		localResourceRoots: [context.extensionUri]
	});
	const css = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'jsoneditor', 'dist', 'jsoneditor.min.css'));
	const script = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'jsoneditor', 'dist', 'jsoneditor.min.js'));
	const viewerScript = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'body-viewer.js'));
	const viewerCss = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'body-viewer.css'));
	const panelScript = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'body-panel.js'));
	const payload = JSON.stringify({ text, mimeType }).replace(/</g, '\\u003c');
	panel.webview.html = `<!doctype html><html class="body-tab" lang="zh-CN"><head><meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<link rel="stylesheet" href="${css}"><link rel="stylesheet" href="${viewerCss}"></head>
		<body><div id="body-editor" class="body-viewer"></div>
		<script id="body-payload" type="application/json">${payload}</script>
		<script src="${script}"></script><script src="${viewerScript}"></script><script src="${panelScript}"></script>
		</body></html>`;
}

module.exports = {
	activate,
	deactivate,
	HarCustomEditorProvider,
	createHarDocument,
	renderHarEditor
};
