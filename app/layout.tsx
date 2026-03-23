// 【頁面外框】
// 這個文件負責：套在所有頁面外層的基本結構。
// 設定網頁標題（閱讀網站）和語言，同時在每次打開時自動把你的字體設定載入好。

import './globals.css'
import type { Metadata } from 'next'
import FontLoader from './components/FontLoader'

export const metadata: Metadata = {
  title: '閱讀網站',
  description: '一句一句閱讀電子書',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body>
        <FontLoader />
        {children}
      </body>
    </html>
  )
}
