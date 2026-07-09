// 【雲端儲存授權】
// 這個文件負責：讓用戶有權限把大檔案存到雲端。
// 简單說：用戶要同步資料時，瀏覽器會先來這裡詢問「我可以上傳吗？」，得到同意後才直接傳到雲端。
// 這樣可以上傳很大的檔案，不會被大小限制擋住。

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { del } from '@vercel/blob'
import { NextRequest, NextResponse } from 'next/server'

// 刪除指定的 blob（上傳新版本後清理舊版本用）
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { url } = await request.json()
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
      return NextResponse.json({ error: '無效的 URL' }, { status: 400 })
    }
    await del(url)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['application/json', 'application/gzip', 'application/octet-stream'],
        maximumSizeInBytes: 500 * 1024 * 1024,
        allowOverwrite: true,   // 檔名用內容 hash，重複上傳同名內容一致，允許覆蓋避免「already exists」
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}
