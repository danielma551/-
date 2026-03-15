/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['epub2', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist'],
  },
  outputFileTracingIncludes: {
    '/api/upload': [
      './node_modules/pdfjs-dist/**/*',
      './node_modules/@napi-rs/canvas/**/*',
    ],
  },
}

module.exports = nextConfig
