import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skips ESLint checks during production builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
