/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ottimizzazioni per performance
  experimental: {
    // Abilita ottimizzazioni sperimentali
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },
  
  // Ottimizzazioni immagini
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 giorni
  },
  
  // Ottimizzazioni bundle
  webpack: (config, { dev, isServer }) => {
    // Ottimizzazioni per produzione
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true,
          },
        },
      };
    }
    
    return config;
  },
  
  // Headers per performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=300, s-maxage=300', // 5 minuti cache per API
          },
        ],
      },
    ];
  },
  
  // Compressione
  compress: true,
  
  // Ottimizzazioni per Firebase
  output: 'standalone',
  
  // Disabilita source maps in produzione per ridurre bundle size
  productionBrowserSourceMaps: false,
  
  // Ottimizzazioni per TypeScript
  typescript: {
    ignoreBuildErrors: false,
  },
  
  // Ottimizzazioni per ESLint
  eslint: {
    ignoreDuringBuilds: false,
  },
  
  // Configurazione per PWA (opzionale)
  // pwa: {
  //   dest: 'public',
  //   register: true,
  //   skipWaiting: true,
  // },
};

module.exports = nextConfig;
