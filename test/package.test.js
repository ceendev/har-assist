const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { test } = require('node:test');
const run = promisify(execFile);
const root = path.resolve(__dirname, '..');

test('the actual VSIX stays lean and its isolated body viewers remain functional', async t => {
	const vsix = path.resolve(process.env.HAR_ASSIST_VSIX || path.join(root, 'har-assist.vsix'));
	assert.ok(fs.existsSync(vsix), 'Build the VSIX first with npm run package');
	const compressed = fs.statSync(vsix).size;
	assert.ok(compressed < 1024 * 1024, 'VSIX exceeds the 1 MiB compressed size budget');
	const { stdout: listing } = await run('unzip', ['-Z1', vsix]);
	const files = listing.trim().split(/\r?\n/);
	assert.ok(files.length < 100, 'Unexpected increase in packaged file count');
	for (const name of files) {
		assert.ok(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..'), 'Unsafe archive path: ' + name);
	}
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'har-assist-vsix-test-'));
	t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
	await run('unzip', ['-q', vsix, '-d', temp]);
	const extensionRoot = path.join(temp, 'extension');
	const bundledAssets = new Set([
        'media/body-viewer.bundle.js',
        'media/content-viewer.css',
		'node_modules/@vscode/codicons/dist/codicon.css',
		'node_modules/@vscode/codicons/dist/codicon.ttf'
	]);
	let expanded = 0;
	for (const name of files) {
		const file = path.join(temp, name);
		if (!fs.statSync(file).isFile()) continue;
		expanded += fs.statSync(file).size;
		const relative = path.relative(extensionRoot, file).split(path.sep).join('/');
		if (relative.startsWith('node_modules/')) {
			assert.ok(bundledAssets.has(relative) || /^(LICENSE[^/]*|NOTICE[^/]*|package\.json)$/.test(path.basename(relative)), 'Unneeded dependency asset: ' + relative);
		}
		assert.ok(!/\.(har|map|vsix)$/.test(relative), 'Development/user data leaked into VSIX: ' + relative);
		// jsdom loads scripts/styles but not fonts or CSS images. Check those
		// references separately so slimming cannot silently remove their files.
		if (relative.endsWith('.css')) {
			for (const match of fs.readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
				const url = match[1];
				assert.ok(!/^https?:/.test(url), 'Runtime CSS must not fetch remote assets');
				if (url.startsWith('data:') || url.startsWith('#')) continue;
				assert.ok(fs.existsSync(path.resolve(path.dirname(file), url.split(/[?#]/)[0])), 'Missing CSS asset: ' + url);
			}
		}
	}
	assert.ok(expanded < 3 * 1024 * 1024, 'VSIX exceeds the 3 MiB installed size budget');
	for (const file of [...bundledAssets, 'LICENSE.md', 'THIRD_PARTY_NOTICES.md', 'node_modules/@codemirror/view/LICENSE', 'node_modules/@codemirror/state/LICENSE', 'node_modules/@vscode/codicons/LICENSE', 'node_modules/@vscode/codicons/LICENSE-CODE']) {
		assert.ok(fs.existsSync(path.join(extensionRoot, file)), 'Missing runtime asset or license: ' + file);
	}
	const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
	assert.equal(manifest.version, require('../package.json').version);
	assert.ok(fs.existsSync(path.join(extensionRoot, manifest.icon)), 'Missing Marketplace icon');
	const childEnv = { ...process.env, HAR_ASSIST_TEST_ROOT: extensionRoot };
	// Start an independent runner; inheriting the parent test context can cause
	// Node to skip the child suite silently instead of reporting its failures.
	delete childEnv.NODE_TEST_CONTEXT;
	const { stdout } = await run(process.execPath, ['--test', '--test-reporter=tap', 'test/content-viewer.test.js', 'test/request-list.test.js', 'test/overview.test.js', 'test/request-path.test.js'], {
		cwd: root,
		env: childEnv,
		timeout: 120000
	});
	assert.match(stdout, /# pass [1-9]\d*\b/, 'The isolated body-viewer suite did not execute');
	assert.match(stdout, /# fail 0\b/);
	t.diagnostic(stdout.trim());
	t.diagnostic(`${files.length} files; ${compressed} bytes compressed; ${expanded} bytes expanded`);
});
