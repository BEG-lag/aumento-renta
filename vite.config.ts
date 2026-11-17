import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const OUT_DIR = resolve(import.meta.dirname, 'dist');
const PUBLIC_DIR = resolve(import.meta.dirname, 'public');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/**
 * Writes the list of built files and a cache version into dist/sw.js, so the
 * first visit already works offline (index data included) and every release,
 * including a data refresh, replaces the old cache.
 */
function precacheManifest(): Plugin {
  let files: string[] = [];
  return {
    name: 'aumento-renta-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      files = Object.keys(bundle).filter((f) => !/\.(map|woff)$/.test(f) && f !== 'index.html');
    },
    closeBundle() {
      const fromPublic = listFiles(PUBLIC_DIR)
        .map((f) => relative(PUBLIC_DIR, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.startsWith('.') && f !== 'icons/og.png');
      const all = ['./', ...[...files, ...fromPublic].sort().map((f) => `./${f}`)];
      const sw = resolve(OUT_DIR, 'sw.js');
      const hash = createHash('sha256');
      for (const f of all.slice(1)) hash.update(f).update(readFileSync(resolve(OUT_DIR, f.slice(2))));
      hash.update(readFileSync(resolve(OUT_DIR, 'index.html')));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(sw, 'utf8');
      writeFileSync(
        sw,
        source
          .replace("const VERSION = 'dev';", `const VERSION = '${version}';`)
          .replace('const PRECACHE = [];', `const PRECACHE = ${JSON.stringify(all)};`),
      );
    },
  };
}

export default defineConfig({
  base: '/aumento-renta/',
  plugins: [precacheManifest()],
  build: {
    outDir: OUT_DIR,
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: { port: 5174 },
  preview: { port: 4174 },
});
