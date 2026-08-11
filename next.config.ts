import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build a self-contained production runtime so production workstations never
  // need the TypeScript source tree or a local npm install.
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  productionBrowserSourceMaps: false,
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    serverSourceMaps: false,
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
};

export default nextConfig;
