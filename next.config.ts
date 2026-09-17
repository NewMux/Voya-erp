import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker image stays small and
  // does not need node_modules at runtime. Required by the Coolify deployment.
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@react-pdf/renderer'],
  eslint: {
    // Lint runs as its own CI step; don't fail production builds on style.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
