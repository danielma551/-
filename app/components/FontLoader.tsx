'use client'

import { useEffect } from 'react'
import { fontStorage } from '../utils/storage'

export default function FontLoader() {
  useEffect(() => {
    const savedFont = fontStorage.getFont()

    if (savedFont && savedFont.fontData) {
      const fontName = savedFont.fontFamily

      // Check if font is already loaded
      const isFontLoaded = Array.from(document.fonts.values()).some(
        font => font.family === fontName
      )

      if (!isFontLoaded) {
        const fontFace = new FontFace(fontName, `url(${savedFont.fontData})`)
        fontFace.load()
          .then((loadedFace) => {
            document.fonts.add(loadedFace)
          })
          .catch((error) => {
            console.error('Failed to load custom font:', error)
          })
      }
    }
  }, [])

  return null
}
