/**
 * Patches Next.js app-paths-manifest.json so that:
 * 1) Normalized path keys are added (e.g. /api/ai/commands) for lookup during "Collecting page data".
 * 2) Any app route/page found on disk but missing from the manifest is added (workaround for incomplete manifest).
 *
 * Next expects getPagePath(page) to resolve using normalized paths; the manifest often only has segment keys (e.g. /api/ai/commands/route).
 * Run this from a webpack "done" hook after the server/edge compilers have written the manifest.
 */

const path = require('path');
const fs = require('fs');

const APP_PATHS_MANIFEST = 'app-paths-manifest.json';
const PAGE_EXTS = ['.ts', '.tsx', '.js', '.jsx'];

/** Normalize app path: strip trailing /page and /route, ignore (groups) and @parallel */
function normalizeAppPath(route) {
  if (!route || typeof route !== 'string') return route;
  const withLeading = route.startsWith('/') ? route : `/${route}`;
  return withLeading
    .split('/')
    .filter(Boolean)
    .reduce((acc, segment, index, segments) => {
      if (segment.startsWith('(') && segment.endsWith(')')) return acc; // group
      if (segment.startsWith('@')) return acc; // parallel
      const isLast = index === segments.length - 1;
      if ((segment === 'page' || segment === 'route') && isLast) return acc;
      return acc + '/' + segment;
    }, '') || '/';
}

function patchManifest(serverDir, appDir) {
  const manifestPath = path.join(serverDir, APP_PATHS_MANIFEST);
  if (!fs.existsSync(manifestPath)) return;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return;
  }

  const next = { ...manifest };

  // 1) Add normalized path key for every existing key so lookup by normalized path works
  for (const key of Object.keys(manifest)) {
    const normalized = normalizeAppPath(key);
    if (normalized && normalized !== key && !next[normalized]) {
      next[normalized] = manifest[key];
    }
  }

  // 2) Discover app routes from filesystem and add any missing (workaround for incomplete manifest)
  if (appDir && fs.existsSync(appDir)) {
    function scan(dir, prefix = '') {
      const names = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of names) {
        const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (ent.name.startsWith('_')) continue;
          scan(full, rel);
          continue;
        }
        if (!ent.isFile()) continue;
        const ext = path.extname(ent.name);
        const base = path.basename(ent.name, ext);
        if (base !== 'page' && base !== 'route') continue;
        if (!PAGE_EXTS.includes(ext)) continue;

        const segmentKey = '/' + rel.replace(/\\/g, '/');
        const normalized = normalizeAppPath(segmentKey);
        const value = 'app/' + rel.replace(/\\/g, '/').replace(ext, '.js');

        if (!next[segmentKey]) next[segmentKey] = value;
        if (normalized && !next[normalized]) next[normalized] = value;
      }
    }
    scan(appDir);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(next, null, 2), 'utf8');
}

module.exports = { patchManifest, normalizeAppPath };
