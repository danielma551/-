// 【雲端儲存授權】
// 這個文件負責：讓用戶有權限把大檔案存到雲端。
// 简單說：用戶要同步資料時，瀏覽器會先來這裡詢問「我可以上傳吗？」，得到同意後才直接傳到雲端。
// 這樣可以上傳很大的檔案，不會被大小限制擋住。

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['application/json'],
        maximumSizeInBytes: 500 * 1024 * 1024,
      }),
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 })
  }
}
