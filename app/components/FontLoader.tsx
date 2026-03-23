// 【字體自動恢復】
// 這個文件負責：每次開啟頁面時，自動把之前存好的字體載入進來。
// 简單說：它在後台對默默工作，不會顯示任何东西，只是確保你選的字體在後續展示時就已經準備好了。

'use client'

import { useEffect } from 'react'
import { getFontFromIDB } from '../utils/fontDB'

export default function FontLoader() {
  useEffect(() => {
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
