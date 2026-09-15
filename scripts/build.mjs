import { build } from 'esbuild';

build({
    entryPoints: ['media/content-viewer.js'],
    outfile: 'media/body-viewer.bundle.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome100',
    minify: true,
    legalComments: 'inline'
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
