import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace deps from the monorepo root so standalone paths are stable in Docker.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@glance/shared'],
}

export default nextConfig
