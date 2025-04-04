/** @type {import('next').NextConfig} */
const nextConfig = {
  // ... other configurations you might have ...

  // Add this block:
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. Make sure linting is checked separately.
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;