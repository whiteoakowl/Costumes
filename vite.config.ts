import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Lists every file under a folder, as paths relative to that folder. */
function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

/**
 * Writes dist/sw.js from pwa/sw.js with the exact list of files in this build,
 * so the installed app can open with no connection and updates replace the old copy.
 */
function serviceWorker(): Plugin {
  return {
    name: 'dance-studio-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      // _headers is Netlify config; icon-full.svg is only the source drawing for the PNG icons.
      const publicFiles = listFiles('public').filter((f) => f !== '_headers' && f !== 'icons/icon-full.svg');
      // Pre-save the everyday (Latin, woff2) fonts; other alphabets are saved the first time they're used.
      const isFont = (f: string) => /\.(woff2?|ttf)$/.test(f);
      const keepFont = (f: string) => /-latin-\d+-(normal|italic).*\.woff2$/.test(f);
      const files = [...new Set(['index.html', ...built, ...publicFiles])].filter((f) => !isFont(f) || keepFont(f)).sort();
      const template = readFileSync('pwa/sw.js', 'utf8');
      const version = createHash('sha256').update(template).update(files.join('\n')).digest('hex').slice(0, 12);
      const precache = ['./', ...files.map((f) => `./${f}`)];
      const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Relative base so the built app works from any sub-path (e.g. GitHub Pages) or a domain root (Netlify).
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
