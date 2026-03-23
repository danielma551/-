// 【網站設定檔】
// 這個文件負責：告訴網站框架（Next.js）一些特殊的設定。
// 主要作用：指定哪些功能套件（如讀取 EPUB、PDF、OCR 識字）不要被打包壓縮，
// 讓它們以原本的方式在伺服器上直接運行，避免部署到 Vercel 時出錯。

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['epub2', '@napi-rs/canvas', 'tesseract.js', 'pdfjs-dist'],
  },
}

module.exports = nextConfig
