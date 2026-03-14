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
