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
