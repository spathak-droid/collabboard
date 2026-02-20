/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Disable React Strict Mode to prevent duplicate Konva/Yjs instances
  // React Strict Mode intentionally double-mounts components in development,
  // which causes "Several Konva instances" and "Yjs was already imported" warnings
  // These warnings are harmless but noisy. We disable Strict Mode for cleaner development.
  reactStrictMode: false,
};

export default nextConfig;
