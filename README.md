# 閱讀網站 · My Spirit World

一個以「一句一句讀」為核心的個人閱讀與學習工作台。

它本身不是內容平台：書來自你上傳的檔案，文章來自 RSS／網頁書籤，外刊由 AI 生成。
所有資料預設只留在你的瀏覽器；需要多裝置才開啟雲端同步。

- 前端：Next.js 14（App Router）＋ React 18 ＋ TypeScript ＋ TailwindCSS
- 後端：Next.js Route Handlers（少量）＋ Vercel Blob ＋ Upstash Redis
- 特色：一句一頁、鍵盤／震動翻頁、跨書搜索、SRS 温習、閱讀統計、墨水屏模式

---

## 快速開始

需求：Node.js 18.17+（建議 20 LTS）、npm。

```bash
npm install
npm run dev
```

打開 <http://localhost:3000>。首次進入是空書架，按右上角「添加書籍」上傳第一本書。

正式建置：

```bash
npm run build
npm start
```

### 環境變數（可選）

只有「雲端同步」需要。複製 `.env.local` 範本或直接在 Vercel 設定：

| 變數 | 用途 |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob，存放書檔與同步清單 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis，存放同步碼與索引 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis 權限 |

不設定也能正常本機閱讀，只是無法跨裝置同步。AI 功能的 key 不在環境變數，而是在網站介面輸入（見下文）。

---

## 頁面一覽

| 路徑 | 名稱 | 用途 |
| --- | --- | --- |
| `/` | 我的書架 | 書架、上傳、閱讀器、今日、統計、RSS |
| `/work` | 打電話賺錢 | 把打電話 confirm payment 換算成每通收入 |
| `/pdfs` | 講稿庫 | PDF／Word 本機儲存、全庫搜尋、頁面高光 |
| `/transcribe` | 音頻轉文字 | Whisper 瀏覽器本機轉錄，可存成「錄音書」 |
| `/import` | 網頁收入書架 | 用書籤小工具把網頁正文收進書架／章節 |
| `/add` | 快速加筆記 | 任何網站選字後一鍵丟進温習循環 |

---

## 書架（首頁）

- **上傳**：TXT、EPUB、PDF。EPUB 在瀏覽器解 ZIP；PDF 先抽文字，掃描版自動轉 OCR。
- **OCR**：免 key 用 Tesseract（`chi_sim`＋`chi_tra`）；填入 Mistral Pixtral 或 GPT-4o 的 key 可大幅提升中文掃描書準確率。
- **書卡**：自動漸變封面或自訂圖片、圓形進度環、最後閱讀日期、已讀／總句數。
- **每本書每日目標**（預設 404 句）：封面顯示 `今日 12/404` 或「✅ 達標」徽章。
- **繼續閱讀**：一鍵跳回最近讀到的那一句。
- **追加內容**：把下冊或後續章節接在同一本書尾。
- **錄音文件夾**：`/transcribe` 產生的書集中在此。
- **人物關係圖**：共現統計，可選用 DeepSeek 做 LLM 分析（每本書快取一次）。
- **閱讀日曆**：單本書逐日句數的月曆檢視。
- **工具選單**：講稿庫、轉錄、網頁收入、每日外刊、背景音樂、AI 設定。

上傳的書名會自動清掉檔名尾段的 `(網站名)`、`（…）`、`[…]` 等雜訊。

---

## 閱讀器

- 一次顯示一句（外刊／圖片書可顯示圖片），左右鍵或畫面按鈕翻頁，手機可震動。
- 頂部進度條；「🚇 閱讀地鐵線」把章節變成站點，到站有提示音。
- **跨書搜索側欄**：常駐右側，點結果先看前後 5 句上下文，再決定跳轉。
- **查詞**：現代漢語詞典（`/api/dict`）＋ 英文 Free Dictionary。
- **選字**：查 Wikipedia 圖片、加入温習、看外刊詞解卡。
- **顯示設定**：字體大小、8 套主題或自選配色、進度條顏色、震動強度。
- **字體**：系統中文字體或上傳自己的 TTF（存 IndexedDB）。
- **壁紙**：原創 SVG 場景（雨、湖、星空、書房、竹）或自己的照片；可模糊、淡化、加底。
- **氛圍**：下雨特效、背景音樂（本機音檔＋YouTube 連結，清單循環）。
- **休息**：每 4 個循環彈出一次呼吸卡（吸 4 秒／呼 4 秒）。
- **墨水屏模式**：黑白高對比、關動畫、自動放大字、長按查詞。
- **達標**：達到今日目標後顯示結算並回首頁（非墨水屏才有彩帶）。
- **遊戲化**：XP、等級稱號、連續打卡、打怪擊殺。
- **AI 校對**：錄音書可用 DeepSeek 逐行改錯別字（保持行數，時間軸不亂）。

---

## 温習、練習與統計

- **快速筆記**：首頁隨手寫，`⌘/Ctrl + Enter` 加入，即刻進入 SRS 温習循環。
- **每日温習**：每天抽 24 張到期筆記做成一本「虛擬書」，逐頁揭、確認後才計入。
- **温習熱圖**：GitHub 風格格子（琥珀色），同時是温習入口與卡片管理入口。
- **每日練習**：1000 個常用英文單詞，每天 13 個，聽拼讀後默寫。
- **統計**：30 天閱讀趨勢、閱讀熱圖、閱讀速度折線圖（句／分鐘）。

---

## 工具頁

### `/work` 打電話賺錢

輸入月薪、每月工作日、每日目標通數，算出每通電話值多少錢；每打一通就即時「賺」一次，有浮動金額與當日累計。資料只存 localStorage。

### `/pdfs` 講稿庫

PDF 與 Word（`.docx`）本機儲存。PDF 用 pdf.js 畫頁並依文字座標疊黃色高光，Word 用 mammoth 轉網頁格式後以 `<mark>` 標示；全庫搜尋、上／下筆結果跳轉、記住上次頁碼。錄音書的參考檔會自動收入。

### `/transcribe` 音頻轉文字

用 transformers.js 在瀏覽器跑 Whisper：免費、免 API key、不上傳伺服器，支援中英混合。首次需下載模型（有快取）。轉錄結果可按時間戳切成句子、繁轉簡、DeepSeek 校對，最後存成可跟讀的「錄音書」。

### `/import` 網頁收入書架

提供書籤小工具（bookmarklet）：在得到、微信公眾號等頁面按一下，抽出正文（有選取就用選取）送到 `/import` 預覽，可存成新書或同一來源的新章節。只抄你正在看的那一頁，不登入、不掃描帳號。

### `/add` 快速加筆記

`/add?text=...&source=...` 會自動加入筆記；手機可直接開頁面貼上。

### RSS 訂閱

首頁底部可加入 RSS 來源（微信公眾號需先經 RSSHub／wechat2rss 轉成 RSS），點文章抓正文後直接進閱讀器逐句讀。

---

## AI 功能與金鑰

金鑰只存在瀏覽器 `localStorage`，由前端直接呼叫供應商 API，不經本站伺服器。

| 功能 | 供應商 | 設定位置 |
| --- | --- | --- |
| 掃描 PDF OCR | Mistral Pixtral 或 OpenAI GPT-4o | 工具 → AI 設定 |
| 每日外刊 | DeepSeek | 工具 → AI 設定 |
| 人物關係分析 | DeepSeek | 工具 → AI 設定 |
| 錄音轉文字校對 | DeepSeek | 工具 → AI 設定 |

沒有 key 時：TXT／EPUB／文字型 PDF 照常可用，OCR 退回 Tesseract，人物圖退回啟發式統計。

---

## 資料存放與雲端同步

| 資料 | 位置 |
| --- | --- |
| 書本內容、進度、封面 | IndexedDB（`bookDB`） |
| 上傳字體 | IndexedDB（`fontDB`） |
| 背景音樂、錄音、參考 PDF、講稿庫 | 各自 IndexedDB |
| 快捷鍵、顯示、壁紙、歷史、温習、遊戲化 | localStorage |
| 雲端備份 | Vercel Blob ＋ Upstash Redis（可選） |

雲端同步：在兩部裝置輸入同一組 10 位同步碼（格式 `xxxx-xxx-xxx`）即可雙向合併。規則是先拉雲端、與本機合併、再推回去；閱讀進度以最後閱讀時間較新者為準；刪書會寫入墓碑，避免另一部機復活。同步碼遺失等於無法取回雲端資料。

> 注意：清除瀏覽器網站資料會一併清掉本機書本。重要書請先開啟雲端同步備份。

---

## 部署（Vercel）

1. 匯入 repo，Framework 選 Next.js。
2. 建立 Vercel Blob store，把 `BLOB_READ_WRITE_TOKEN` 加入環境變數。
3. 建立 Upstash Redis，加入 `UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`。
4. 部署。`vercel.json` 已為 `/api/rss` 設定 120 秒上限，並把 pdfjs／canvas／詞典檔納入函式。

---

## 專案結構

```
app/
  page.tsx              書架＋閱讀器切換、上傳／OCR、今日、統計
  layout.tsx            全域外框、字體自動載入
  components/           Reader、各面板與圖表
  utils/                IndexedDB、同步、解析、温習、遊戲化
  api/                  upload、rss、dict、images、sync、blob
  work/ pdfs/ import/ transcribe/ add/
public/fonts/           內建字體
```

---

## 開發備註

- 介面語言為繁體中文，語氣偏香港粵語口語。
- 手機優先；橫屏會收起部分工具列但保留進度。
- 多數功能在 client component 執行，`'use client'` 是常態。
- 書本資料量大，一律走 IndexedDB，不放 localStorage。
- 型別檢查：`npx tsc --noEmit`。

---

最後更新：2026-11
