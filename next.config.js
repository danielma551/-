/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['epub2', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist'],
  },
}

module.exports = nextConfig
