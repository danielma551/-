// 【RSS 訂閱面板】
// 這個文件負責：首頁的「訂閱」區塊。
// 用戶可以：
//   - 添加 RSS 訂閱（公眾號需先用 RSSHub / wechat2rss 轉成 RSS 網址）
//   - 查看各來源的最新文章列表
//   - 點擊文章 → 抓取正文 → 直接進入閱讀器逐句閱讀

'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, RefreshCw, ChevronDown, ChevronUp, Rss, Pencil } from 'lucide-react'
import { feedStorage, FeedSource } from '../utils/storage'

// 一篇文章的資料格式
interface Article {
  title: string
  link: string
  date: string
  summary: string
  content: string  // 完整正文（純文字，已去 HTML 標籤），Wewe-RSS fulltext 模式會填入
}

// 一個 Feed 來源抓取回來的資料
interface FeedData {
  feedTitle: string
  articles: Article[]
  error?: string
  loading: boolean
  expanded: boolean
}

interface FeedPanelProps {
  // 用戶點文章後，回傳句子陣列讓首頁開始閱讀（附文章原始連結將条更新已閱讀狀態）
  onReadArticle: (sentences: string[], title: string, link: string) => void
}

export default function FeedPanel({ onReadArticle }: FeedPanelProps) {
  // 所有訂閱來源
  const [feeds, setFeeds] = useState<FeedSource[]>([])
  // 每個 Feed 抓取到的資料（key = feed.id）
  const [feedData, setFeedData] = useState<Record<string, FeedData>>({})
  // 新增面板的開關
  const [showAddForm, setShowAddForm] = useState(false)
  // 新增表單的輸入值
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  // 正在抓取某篇文章的正文
  const [loadingArticle, setLoadingArticle] = useState<string | null>(null)
  // 已閱讀的文章連結集合（存 localStorage）
  const [readLinks, setReadLinks] = useState<Set<string>>(new Set())
  // 是否隱藏已閱讀文章
  const [hideRead, setHideRead] = useState(false)
  // 正在編輯 URL 的 feed id
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null)
  // 編輯中的 URL 輸入值
  const [editingUrl, setEditingUrl] = useState('')

  // 載入已儲存的訂閱來源
  useEffect(() => {
    const saved = feedStorage.getFeeds()
    setFeeds(saved)
    // 載入已閱讀記錄
    try {
      const raw = localStorage.getItem('reading-feed-read')
      if (raw) setReadLinks(new Set(JSON.parse(raw)))
    } catch {}
    // 自動抓取每個 Feed 的最新文章
    saved.forEach(feed => fetchFeed(feed))
  }, [])

  // 標記某篇文章為已閱讀並持久化
  const markAsRead = (link: string) => {
    setReadLinks(prev => {
      const next = new Set(prev)
      next.add(link)
      try { localStorage.setItem('reading-feed-read', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // 判斷是否為本地 URL（localhost / 127.0.0.1），本地 URL 由瀏覽器直接抓取
  const isLocalUrl = (url: string) =>
    url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')

  // 客戶端直接解析 RSS/Atom XML 字串（用於 localhost Feed）
  const parseXml = (xml: string, fallbackName: string) => {
    const getTag = (block: string, tag: string) => {
      const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'))
      if (cdata) return cdata[1].trim()
      const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
      return plain ? plain[1].trim() : ''
    }
    const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s{2,}/g, ' ').trim()
    const fmtDate = (s: string) => {
      if (!s) return ''
      const d = new Date(s)
      if (isNaN(d.getTime())) return s
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
      return diff === 0 ? '今天' : diff === 1 ? '昨天' : diff < 7 ? `${diff} 天前` : d.toLocaleDateString('zh-TW')
    }
    const feedTitle = stripHtml(getTag(xml, 'title')) || fallbackName
    const items: Article[] = []
    const pat = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi
    let m
    while ((m = pat.exec(xml)) !== null && items.length < 50) {
      const b = m[1]
      const title = stripHtml(getTag(b, 'title')) || '（無標題）'
      let link = getTag(b, 'link')
      if (!link) { const h = b.match(/<link[^>]+href="([^"]+)"/) ; link = h ? h[1] : '' }
      const date = fmtDate(getTag(b, 'pubDate') || getTag(b, 'published') || getTag(b, 'updated'))
      const raw = getTag(b, 'content:encoded') || getTag(b, 'content') || getTag(b, 'description') || getTag(b, 'summary')
      const plainContent = stripHtml(raw)
      const summary = plainContent.slice(0, 120) + (plainContent.length > 120 ? '…' : '')
      if (title && link) items.push({ title, link, date, summary, content: plainContent })
    }
    return { feedTitle, articles: items }
  }

  // 抓取單個 Feed 的文章列表
  const fetchFeed = async (feed: FeedSource) => {
    // 設定 loading 狀態
    setFeedData(prev => ({
      ...prev,
      [feed.id]: { feedTitle: feed.name, articles: [], loading: true, expanded: prev[feed.id]?.expanded ?? true }
    }))
    try {
      let data: { feedTitle: string; articles: Article[]; error?: string }
      if (isLocalUrl(feed.url)) {
        // localhost：瀏覽器直接抓，不走 Vercel（Vercel 伺服器無法存取本地網路）
        const res = await fetch(feed.url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const xml = await res.text()
        data = parseXml(xml, feed.name)
      } else {
        // 遠端 URL：走 Vercel /api/rss 代理（繞過 CORS）
        const res = await fetch(`/api/rss?url=${encodeURIComponent(feed.url)}`)
        data = await res.json()
      }
      setFeedData(prev => ({
        ...prev,
        [feed.id]: {
          feedTitle: data.feedTitle || feed.name,
          articles: data.articles || [],
          error: data.error,
          loading: false,
          expanded: prev[feed.id]?.expanded ?? true
        }
      }))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '抓取失敗'
      setFeedData(prev => ({
        ...prev,
        [feed.id]: { feedTitle: feed.name, articles: [], error: `抓取失敗：${msg}`, loading: false, expanded: prev[feed.id]?.expanded ?? true }
      }))
    }
  }

  // 刷新所有 Feed
  const refreshAll = () => {
    feeds.forEach(feed => fetchFeed(feed))
  }

  // 展開 / 收起某個 Feed
  const toggleExpand = (id: string) => {
    setFeedData(prev => ({
      ...prev,
      [id]: { ...prev[id], expanded: !prev[id]?.expanded }
    }))
  }

  // 新增一個訂閱來源
  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return
    const feed: FeedSource = {
      id: Date.now().toString(),
      name: newName.trim(),
      url: newUrl.trim()
    }
    feedStorage.addFeed(feed)
    setFeeds(prev => [...prev, feed])
    fetchFeed(feed)
    setNewName('')
    setNewUrl('')
    setShowAddForm(false)
  }

  // 更新某個訂閱的 URL
  const handleUpdateUrl = (id: string) => {
    const trimmed = editingUrl.trim()
    if (!trimmed) return
    feedStorage.updateFeedUrl(id, trimmed)
    setFeeds(prev => prev.map(f => f.id === id ? { ...f, url: trimmed } : f))
    setEditingFeedId(null)
    setEditingUrl('')
    const updated = feeds.find(f => f.id === id)
    if (updated) fetchFeed({ ...updated, url: trimmed })
  }

  // 刪除一個訂閱來源
  const handleRemove = (id: string) => {
    if (!confirm('確定要刪除這個訂閱嗎？')) return
    feedStorage.removeFeed(id)
    setFeeds(prev => prev.filter(f => f.id !== id))
    setFeedData(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  // 把純文字切成句子（與 upload 路由一致）
  const splitSentences = (text: string): string[] => {
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
    const matches = cleaned.match(/[^.!?。！？;；,，:：]+[.!?。！？;；,，:：]+/g) || []
    return matches.length > 0
      ? matches.map(s => s.trim()).filter(s => s.length > 0)
      : cleaned.length > 0 ? [cleaned] : []
  }

  // 點擊文章：優先使用 feed 內建全文（Wewe-RSS fulltext 模式），否則再抓網頁
  const handleReadArticle = async (article: Article) => {
    // 若 feed 已含完整正文（Wewe-RSS FEED_MODE=fulltext），直接使用，不需再抓 WeChat 網址
    if (article.content && article.content.length > 200) {
      const sentences = splitSentences(article.content)
      if (sentences.length > 0) {
        onReadArticle(sentences, article.title, article.link)
        return
      }
    }
    // 備用：抓取文章原始網頁
    setLoadingArticle(article.link)
    try {
      const res = await fetch(`/api/rss?url=${encodeURIComponent(article.link)}&type=article`)
      const data = await res.json()
      if (data.sentences && data.sentences.length > 0) {
        onReadArticle(data.sentences, article.title, article.link)
      } else {
        alert('無法取得文章正文，請嘗試直接在瀏覽器開啟。')
      }
    } catch {
      alert('抓取文章失敗')
    } finally {
      setLoadingArticle(null)
    }
  }

  // 如果沒有訂閱且表單收起，顯示空狀態
  if (feeds.length === 0 && !showAddForm) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-1 h-5 bg-blue-500 rounded-full" />
            <h2 className="text-base font-semibold text-blue-600">訂閱文章</h2>
          </div>
          {/* 新增按鈕 */}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center space-x-1 text-xs text-blue-500 hover:text-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增訂閱</span>
          </button>
        </div>
        <p className="text-sm text-gray-300 text-center py-4">
          新增 RSS 訂閱後，每天打開即可閱讀最新文章
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <div className="w-1 h-5 bg-blue-500 rounded-full" />
          <h2 className="text-base font-semibold text-blue-600">訂閱文章</h2>
        </div>
        <div className="flex items-center space-x-3">
          {/* 隱藏已讀切換 */}
          <button
            onClick={() => setHideRead(v => !v)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              hideRead ? 'bg-gray-100 text-gray-500 border-gray-200' : 'text-gray-300 border-gray-200 hover:text-gray-500'
            }`}
          >
            {hideRead ? '顯示已讀' : '隱藏已讀'}
          </button>
          {/* 刷新按鈕 */}
          <button onClick={refreshAll} className="text-gray-400 hover:text-gray-600" title="刷新所有訂閱">
            <RefreshCw className="w-4 h-4" />
          </button>
          {/* 新增訂閱按鈕 */}
          <button
            onClick={() => setShowAddForm(v => !v)}
            className="flex items-center space-x-1 text-xs text-blue-500 hover:text-blue-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新增</span>
          </button>
        </div>
      </div>

      {/* 新增表單 */}
      {showAddForm && (
        <div className="mb-4 p-4 bg-blue-50 rounded-xl space-y-2">
          <input
            type="text"
            placeholder="名稱（例如：36氪）"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          <input
            type="url"
            placeholder="RSS 網址（例如：https://rsshub.app/...）"
            value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {/* 提示說明 */}
          <p className="text-xs text-blue-400">
            💡 微信公眾號請先到 <a href="https://wechat2rss.xlab.app" target="_blank" rel="noreferrer" className="underline">wechat2rss.xlab.app</a> 轉換成 RSS 網址
          </p>
          <div className="flex space-x-2">
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newUrl.trim()}
              className="flex-1 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-40"
            >
              確認新增
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 每個訂閱來源 */}
      <div className="space-y-4">
        {feeds.map(feed => {
          const data = feedData[feed.id]
          return (
            <div key={feed.id} className="border border-gray-100 rounded-xl overflow-hidden">
              {/* Feed 標題列 */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <button
                  onClick={() => toggleExpand(feed.id)}
                  className="flex items-center space-x-2 flex-1 text-left"
                >
                  <Rss className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-700">{data?.feedTitle || feed.name}</span>
                  {data?.loading && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                  {data?.articles?.length > 0 && (
                    <span className="text-xs text-gray-400">{data.articles.length} 篇</span>
                  )}
                  {data?.expanded
                    ? <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />
                  }
                </button>
                {/* 編輯 URL */}
                <button
                  onClick={() => { setEditingFeedId(feed.id); setEditingUrl(feed.url) }}
                  className="ml-2 text-gray-300 hover:text-blue-400"
                  title="編輯訂閱網址"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {/* 刪除訂閱 */}
                <button
                  onClick={() => handleRemove(feed.id)}
                  className="ml-1 text-gray-300 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 編輯 URL 表單 */}
              {editingFeedId === feed.id && (
                <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex items-center space-x-2">
                  <input
                    autoFocus
                    type="url"
                    value={editingUrl}
                    onChange={e => setEditingUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdateUrl(feed.id); if (e.key === 'Escape') setEditingFeedId(null) }}
                    className="flex-1 px-3 py-1.5 text-sm border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  />
                  <button
                    onClick={() => handleUpdateUrl(feed.id)}
                    className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => setEditingFeedId(null)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                  >
                    取消
                  </button>
                </div>
              )}

              {/* 文章列表（展開時顯示） */}
              {data?.expanded && (
                <div>
                  {data?.error && (
                    <p className="px-4 py-3 text-sm text-red-400">{data.error}</p>
                  )}
                  {!data?.loading && !data?.error && data?.articles?.length === 0 && (
                    <p className="px-4 py-3 text-sm text-gray-300">暫無文章</p>
                  )}
                  {data?.articles
                    ?.filter(a => !hideRead || !readLinks.has(a.link))
                    ?.map((article, idx) => {
                      const isRead = readLinks.has(article.link)
                      return (
                        <button
                          key={idx}
                          onClick={() => handleReadArticle(article)}
                          disabled={loadingArticle === article.link}
                          className={`w-full text-left px-4 py-3 border-t border-gray-50 transition-colors disabled:opacity-50 ${
                            isRead ? 'hover:bg-gray-50 opacity-50' : 'hover:bg-blue-50'
                          }`}
                        >
                          <div className="flex items-start justify-between space-x-2">
                            <div className="flex-1 min-w-0">
                              {/* 文章標題 */}
                              <p className={`text-sm font-medium line-clamp-2 leading-snug ${
                                isRead ? 'text-gray-400' : 'text-gray-800'
                              }`}>
                                {article.title}
                              </p>
                              {/* 摘要 */}
                              {article.summary && (
                                <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                                  {article.summary}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 flex flex-col items-end space-y-1">
                              {/* 發布日期 */}
                              {article.date && (
                                <span className="text-xs text-gray-300">{article.date}</span>
                              )}
                              {/* 已讀 / 載入指示 */}
                              {loadingArticle === article.link
                                ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                                : isRead
                                  ? <span className="text-xs text-green-400">✓ 已讀</span>
                                  : <span className="text-xs text-blue-400">閱讀</span>
                              }
                            </div>
                          </div>
                        </button>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
