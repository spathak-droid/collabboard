import path from 'path';
import { fileURLToPath } from 'url';
import patchAppPaths from './scripts/patch-app-paths-manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { patchManifest } = patchAppPaths;

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Disable React Strict Mode to prevent duplicate Konva/Yjs instances
  reactStrictMode: false,
  webpack(config, { isServer, nextRuntime, dir }) {
    // Patch app-paths-manifest after edge compiler writes it so normalized path
    // lookups work during "Collecting page data" (fixes PageNotFoundError for /api/* and pages).
    if (isServer && nextRuntime === 'edge') {
      const PatchAppPathsPlugin = {
        apply(compiler) {
          compiler.hooks.done.tap('PatchAppPathsManifest', () => {
            const outputPath = compiler.options.output?.path;
            if (!outputPath) return;
            const serverDir = path.resolve(outputPath, '..');
            const appDir = path.resolve(dir || __dirname, 'src', 'app');
            patchManifest(serverDir, appDir);
          });
        },
      };
      config.plugins.push(PatchAppPathsPlugin);
    }
    return config;
  },
};

export default nextConfig;
