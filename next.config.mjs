/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude native modules and their dependencies from webpack bundling
      config.externals = [
        ...(config.externals || []),
        'duckdb-async',
        'duckdb',
        '@mapbox/node-pre-gyp',
        'node-gyp',
        'aws-sdk',
        'mock-aws-s3',
        'nock',
      ]
    }
    
    // Ignore problematic file types in node_modules
    config.module = config.module || {}
    config.module.rules = config.module.rules || []
    config.module.rules.push({
      test: /\.(html|cs)$/,
      type: 'asset/source',
    })
    
    // Ignore specific problematic files
    config.resolve = config.resolve || {}
    config.resolve.alias = {
      ...config.resolve.alias,
      'aws-sdk': false,
      'mock-aws-s3': false,
      'nock': false,
    }
    
    return config
  },
}

export default nextConfig
