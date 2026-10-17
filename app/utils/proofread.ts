// 【DeepSeek AI 校對】語音轉錄逐行改錯別字；行數唔變，所以同錄音時間嘅對應唔會亂。

// ── 🪄 DeepSeek AI 校對：逐行改錯別字，行數唔變（保持同錄音時間對應）──
const PROOF_SYS = `你是专业的中文校对编辑。用户会给你一段语音识别（Whisper）的逐行文字（JSON 数组 lines），内容可能夹杂英文。
请只做以下修正：
1. 同音、近音错别字（例如“在/再”“的/得/地”“做/作”，以及听错的词语）；
2. 明显听错的专有名词、人名、地名、术语、品牌，以及英文单词拼写。
严格要求：
- 不要改写、润饰或总结句子；不要增加或删除内容；
- 不要合并或拆分行：输出第 N 行必须对应输入第 N 行；
- 保留原有标点和英文；中文一律使用简体字；
- 没有错误的行原样返回。
只输出 JSON：{"lines": [...]}，lines 的数量必须与输入完全相同。`

export async function proofreadLines(
  lines: string[], apiKey: string, onProgress: (done: number, total: number) => void,
): Promise<{ lines: string[]; changed: number; failedBatches: number }> {
  const BATCH = 40
  const out = [...lines]
  let changed = 0, failedBatches = 0, finished = 0
  const batches: number[] = []
  for (let i = 0; i < lines.length; i += BATCH) batches.push(i)
  onProgress(0, batches.length)
  const runBatch = async (start: number) => {
    const part = lines.slice(start, start + BATCH)
    let ok = false
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'deepseek-v4-flash',
            thinking: { type: 'disabled' },
            temperature: 0.1,
            max_tokens: 4096,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: PROOF_SYS },
              { role: 'user', content: JSON.stringify({ lines: part }) },
            ],
          }),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const data = await res.json()
        const obj = JSON.parse(data.choices?.[0]?.message?.content || '{}')
        const fixed = obj.lines
        if (!Array.isArray(fixed) || fixed.length !== part.length) throw new Error('行數唔對')
        fixed.forEach((t: unknown, i: number) => {
          const orig = part[i]
          if (typeof t !== 'string' || !t.trim()) return
          const ratio = t.length / Math.max(orig.length, 1)
          if (ratio < 0.6 || ratio > 1.7) return          // 改動太大 = 可能改寫咗 → 保留原文
          if (t !== orig) changed++
          out[start + i] = t
        })
        ok = true
      } catch { /* 重試一次，再唔得就保留原文 */ }
    }
    if (!ok) failedBatches++
    finished++
    onProgress(finished, batches.length)
  }
  // 3 批同時做，加快長錄音
  const queue = [...batches]
  await Promise.all([0, 1, 2].map(async () => { while (queue.length) await runBatch(queue.shift()!) }))
  return { lines: out, changed, failedBatches }
}

