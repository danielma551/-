// 【圖片搜尋 API】
// 接收關鍵字，優先查中文 Wikipedia，找不到才 fallback 英文
// 圖片來源：REST summary thumbnail → pageimages API（更強）→ 無圖文字摘要

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim() || ''
  if (!query) return Response.json({ error: 'no query' }, { status: 400 })

  // 1. 中文直查
  const tryZh = await fetchWikiSummary('zh', query)
  if (tryZh) {
    // 補抓圖片（若 REST 沒有縮圖就用 pageimages API）
    if (!tryZh.imageUrl) {
      tryZh.imageUrl = await fetchPageImage('zh', tryZh.title)
    }
    return Response.json(tryZh)
  }

  // 2. 中文全文搜尋
  const zhSearch = await searchWiki('zh', query)
  if (zhSearch) return Response.json(zhSearch)

  // 3. 英文 fallback（中文完全找不到才用）
  const enSearch = await searchWiki('en', query)
  if (enSearch) return Response.json(enSearch)

  return Response.json({ title: query, extract: null, imageUrl: null })
}

// 用 REST API 直接查 Wikipedia 頁面 summary
async function fetchWikiSummary(lang: string, title: string) {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    const res = await fetch(url, { headers: { 'User-Agent': 'ReadingApp/1.0' } })
    if (!res.ok) return null
    const data = await res.json()
    return {
      title: data.title as string,
      extract: data.extract ? data.extract.slice(0, 150) + (data.extract.length > 150 ? '…' : '') : null,
      imageUrl: (data.thumbnail?.source as string) ?? null,
      lang,
    }
  } catch {
    return null
  }
}

// 用 MediaWiki pageimages API 搶圖（比 REST thumbnail 覆蓋面更廣）
async function fetchPageImage(lang: string, title: string): Promise<string | null> {
  try {
    const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=500&pilimit=1&origin=*`
    const res = await fetch(url)
    const data = await res.json()
    const pages = data?.query?.pages
    if (!pages) return null
    const page = Object.values(pages)[0] as Record<string, unknown>
    const thumb = page?.thumbnail as { source?: string } | undefined
    return thumb?.source ?? null
  } catch {
    return null
  }
}

// 全文搜尋後取結果，優先有圖，再補 pageimages
async function searchWiki(lang: string, query: string) {
  try {
    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&origin=*`
    const sRes = await fetch(searchUrl)
    const sData = await sRes.json()
    const hits: { title: string }[] = sData?.query?.search ?? []
    if (!hits.length) return null

    // 並行取前 5 個 summary，加速
    const summaries = await Promise.all(hits.map(h => fetchWikiSummary(lang, h.title)))

    // 優先回傳有圖的
    for (const s of summaries) {
      if (s?.imageUrl) return s
    }

    // 都沒圖：用 pageimages API 逐一補
    for (const s of summaries) {
      if (!s) continue
      const img = await fetchPageImage(lang, s.title)
      if (img) return { ...s, imageUrl: img }
    }

    // 實在找不到圖：回傳第一個有文字摘要的
    return summaries.find(s => s?.extract) ?? null
  } catch {
    return null
  }
}
