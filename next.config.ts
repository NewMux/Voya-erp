import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker image stays small and
  // does not need node_modules at runtime. Required by the Coolify deployment.
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  // Keep these out of the bundler: Prisma resolves its engine at runtime, and
  // @react-pdf/renderer ships native-ish font handling that must not be traced.
  serverExternalPackages: ['@prisma/client', 'bcryptjs', '@react-pdf/renderer'],
};

export default nextConfig;
