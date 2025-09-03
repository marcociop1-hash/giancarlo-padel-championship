/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  // Disable static export for Vercel deployment
  output: undefined,
  // Optimize for production
  swcMinify: true,
  // Disable telemetry
  telemetry: false,
}

module.exports = nextConfig
