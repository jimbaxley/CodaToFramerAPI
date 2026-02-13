const esbuild = require('esbuild');
const path = require('path');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/pack.ts'],
      bundle: true,
      outfile: 'dist/pack.js',
      platform: 'node',
      target: 'es2022',
      format: 'esm',
      external: ['@codahq/packs-sdk'],
      sourcemap: true,
      minify: false,
    });
    console.log('✓ Build successful with ES2022 target');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();
