// 【網路字型】集中管理要從網路載入嘅字型。
// 用「子集 webfont」（unicode-range 拆成多個 woff2）就唔使下載成個 20MB TTF，
// 瀏覽器只會下載文字用到嘅字，快好多亦穩定好多。

export interface WebFont {
  name: string
  family: string
  css?: string   // 有 css 就用子集 webfont（推薦）
  url?: string   // 冇 css 就退返用單一 FontFace
  desc?: string
}

export const WEB_FONTS: WebFont[] = [
  {
    name: '霞鶩文楷',
    family: 'LXGW WenKai',
    css: 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css',
    desc: '簡繁通用楷書，基於 Klee One',
  },
  {
    name: '芫荽',
    family: 'Iansui',
    url: 'https://raw.githubusercontent.com/ButTaiwan/iansui/main/fonts/ttf/Iansui-Regular.ttf',
    desc: '台灣教育楷書（繁體為主）',
  },
]

export function webFontByFamily(family: string): WebFont | undefined {
  return WEB_FONTS.find(f => f.family === family)
}

// 確保某個網路字型的 CSS 已注入（重複呼叫安全）
export function ensureWebFontCss(family: string): void {
  const wf = webFontByFamily(family)
  if (!wf?.css) return
  const id = 'webfont-css-' + family
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.id = id
  link.href = wf.css
  document.head.appendChild(link)
}

// 載入一個網路字型，成功 resolve、失敗 reject（供 UI 顯示狀態）
export function loadWebFont(wf: WebFont): Promise<void> {
  return new Promise((resolve, reject) => {
    if (wf.css) {
      ensureWebFontCss(wf.family)
      const link = document.getElementById('webfont-css-' + wf.family) as HTMLLinkElement | null
      const finish = (ok: boolean) => (ok ? resolve() : reject(new Error('字體載入失敗')))
      if (link?.sheet) {
        // CSS 已載入，等瀏覽器確認字型可用
        document.fonts.load(`16px "${wf.family}"`).then(() => resolve()).catch(() => resolve())
        return
      }
      link?.addEventListener('load', () => {
        document.fonts.load(`16px "${wf.family}"`).then(() => resolve()).catch(() => resolve())
      }, { once: true })
      link?.addEventListener('error', () => finish(false), { once: true })
      return
    }
    if (wf.url) {
      const ff = new FontFace(wf.family, `url(${wf.url})`)
      ff.load().then(f => { document.fonts.add(f); resolve() }).catch(reject)
      return
    }
    reject(new Error('冇字型來源'))
  })
}
