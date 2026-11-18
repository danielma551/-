// 【字體自動恢復】
// 這個文件負責：每次開啟頁面時，自動把之前存好的字體載入進來。
// 簡單說：它在後台默默工作，不會顯示任何東西，只是確保你選的字體在後續展示時就已經準備好了。

'use client'

import { useEffect } from 'react'
import { getFontFromIDB } from '../utils/fontDB'
import { fontStorage } from '../utils/storage'
import { ensureWebFontCss, webFontByFamily } from '../utils/webFonts'

export default function FontLoader() {
  useEffect(() => {
    // 網路字型（例如霞鶩文楷）：重新注入子集 CSS，跨 session 都有效
    try {
      const family = fontStorage.getFont()?.fontFamily
      if (family && webFontByFamily(family)) ensureWebFontCss(family)
    } catch { /* ignore */ }

    const loadFont = async () => {
      try {
        const saved = await getFontFromIDB()
        if (!saved) return

        const isFontLoaded = Array.from(document.fonts.values()).some(
          font => font.family === saved.fontFamily
        )
        if (!isFontLoaded) {
          const fontFace = new FontFace(saved.fontFamily, `url(${saved.fontData})`)
          const loaded = await fontFace.load()
          document.fonts.add(loaded)
        }
      } catch (error) {
        console.error('Failed to load custom font:', error)
      }
    }
    loadFont()
  }, [])

  return null
}
