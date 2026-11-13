// Writes public/sw.js from pwa/sw.js with a fresh version, so every deploy replaces the old saved copy.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const template = readFileSync('pwa/sw.js', 'utf8');
// Netlify sets COMMIT_REF; locally, use the time of the build.
const stamp = process.env.COMMIT_REF || process.env.GITHUB_SHA || new Date().toISOString();
const version = createHash('sha256').update(template).update(stamp).digest('hex').slice(0, 12);
writeFileSync('public/sw.js', template.replace('__VERSION__', version));
console.log(`service worker version ${version}`);
