// 【字體選擇】
// 這個文件負責：閱讀時右上角的「字體」按鈕。
// 可以安定：宋體、黑體、楷體等常見中文字體。
// 也可以上傳自己的字體檔案（TTF 等格式）。
// 選的字體會马上生效且會自動記住。

'use client'

import { useState, useRef, useEffect } from 'react'
import { Type, Upload, X, Check } from 'lucide-react'
import { fontStorage } from '../utils/storage'

interface FontSelectorProps {
  currentFont: string
  onFontChange: (fontFamily: string, fontData?: string) => void
}

const DEFAULT_FONTS = [
  { name: '系統默認', value: 'system-ui, -apple-system, sans-serif' },
  { name: '宋體', value: 'SimSun, STSong, serif' },
  { name: '黑體', value: 'SimHei, STHeiti, sans-serif' },
  { name: '楷體', value: 'KaiTi, STKaiti, serif' },
  { name: 'Arial', value: 'Arial, sans-serif' },
  { name: 'Times New Roman', value: 'Times New Roman, serif' },
]

export default function FontSelector({ currentFont, onFontChange }: FontSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customFont, setCustomFont] = useState<{ name: string; value: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const savedFont = fontStorage.getFont()
    if (savedFont) {
      setCustomFont({ name: `📎 ${savedFont.fontFamily}`, value: savedFont.fontFamily })
    }
  }, [])

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.(ttf|otf|woff|woff2)$/i)) {
      alert('請上傳字體文件 (.ttf, .otf, .woff, .woff2)')
      return
    }

    try {
      const reader = new FileReader()
      reader.onload = (event) => {
        const fontData = event.target?.result as string
        const fontName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '')
        
        const fontFace = new FontFace(fontName, `url(${fontData})`)
        fontFace.load().then((loadedFace) => {
          document.fonts.add(loadedFace)
          onFontChange(fontName, fontData)
          setCustomFont({ name: `📎 ${fontName}`, value: fontName })
          setIsOpen(false)
        }).catch((error) => {
          console.error('字體加載失敗:', error)
          alert('字體加載失敗，請嘗試其他字體文件')
        })
      }
      reader.readAsDataURL(file)
    } catch (error) {
      console.error('Error loading font:', error)
      alert('字體上傳失敗')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Type className="w-5 h-5 text-gray-600" />
        <span className="text-sm text-gray-700">字體</span>
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
            <div className="p-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-800">選擇字體</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {customFont && (
                <>
                  <button
                    onClick={() => {
                      const savedFont = fontStorage.getFont()
                      if (savedFont) {
                        onFontChange(savedFont.fontFamily)
                      }
                      setIsOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 transition-colors flex items-center justify-between group bg-indigo-50/50"
                  >
                    <span 
                      className="text-indigo-700 font-medium"
                      style={{ fontFamily: customFont.value }}
                    >
                      {customFont.name}
                    </span>
                    {currentFont === customFont.value && (
                      <Check className="w-4 h-4 text-indigo-600" />
                    )}
                  </button>
                  <div className="border-t border-gray-200 my-2"></div>
                </>
              )}
              {DEFAULT_FONTS.map((font) => (
                <button
                  key={font.value}
                  onClick={() => {
                    onFontChange(font.value)
                    setIsOpen(false)
                  }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center justify-between group"
                >
                  <span 
                    className="text-gray-700"
                    style={{ fontFamily: font.value }}
                  >
                    {font.name}
                  </span>
                  {currentFont === font.value && (
                    <Check className="w-4 h-4 text-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="text-sm font-medium">上傳自定義字體</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                onChange={handleFontUpload}
                className="hidden"
              />
              <p className="text-xs text-gray-500 mt-2 text-center">
                支持 TTF, OTF, WOFF, WOFF2
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
