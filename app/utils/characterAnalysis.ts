// 【人物關係分析】
// 從書本句子中提取人物名字，並計算人物之間的共現關係。
// 純客戶端，不需要 API key。
// 算法：對話歸因 + 稱謂模式 + 常見姓氏過濾 + 共現統計

export interface Character {
  name: string
  count: number       // 出現次數
  dialogues: number   // 說話次數
}

export interface Relation {
  source: string
  target: string
  strength: number    // 同句共現次數
}

export interface CharacterGraph {
  characters: Character[]
  relations: Relation[]
}

// ── 常見中文姓氏（前150個）──
const COMMON_SURNAMES = new Set('王李張劉陳楊黃趙吳周徐孫馬朱胡郭何高林鄭謝沈羅韓唐馮于董蕭程曹袁鄧許傅曾彭呂蘇盧蔣蔡賈丁魏薛葉閻余潘杜戴夏鐘汪田任姜范方石姚譚廖鄒熊金陸郝孔白崔康毛邱秦江史顧侯邵孟龍萬段雷錢湯尹黎易常武喬賀賴龔文王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林郑谢沈罗韩唐冯于董萧程曹袁邓许傅曾彭吕苏卢蒋蔡贾丁魏薛叶阎余潘杜戴夏钟汪田任姜范方石姚谭廖邹熊金陆郝孔白崔康毛邱秦江史顾侯邵孟龙万段雷钱汤尹黎易常武乔贺赖龚文'.split(''))

// 稱謂詞：出現在名字後面的職稱/身份詞
const TITLE_SUFFIXES = ['先生', '太太', '小姐', '夫人', '大人', '将军', '將軍', '公子', '老師', '老师', '師父', '师父', '大俠', '大侠', '將軍', '郡主', '王爺', '王爷', '將士', '侯爺', '侯爷', '大夫', '神医', '神醫', '掌門', '掌门', '長老', '长老']

// 稱謂前綴（「老王」「小李」「大張」）
const TITLE_PREFIXES = ['老', '小', '大', '阿']

// 對話動詞
const SPEECH_VERBS = '說说道問问答叫喊嚷哭笑罵骂嘆叹呵斥喝怒道'

// 不可能是人名的常見詞（過濾黑名單）
const BLACKLIST = new Set([
  '什麼', '什么', '這個', '这个', '那個', '那个', '一個', '一个', '自己', '我們', '我们',
  '他們', '他们', '她們', '她们', '你們', '你们', '時候', '时候', '所有', '因為', '因为',
  '雖然', '虽然', '所以', '但是', '如果', '然後', '然后', '覺得', '觉得', '知道', '看見',
  '看见', '聽到', '听到', '走過', '走过', '告訴', '告诉', '認為', '认为', '感覺', '感觉',
  '開始', '开始', '繼續', '继续', '已經', '已经', '只是', '這樣', '这样', '那樣', '那样',
  '沒有', '没有', '可以', '能夠', '能够', '應該', '应该', '不知', '不能', '不會', '不会',
  '有人', '有些', '有時', '有时', '同時', '同时', '後來', '后来', '之後', '之后', '之前',
  '先生', '太太', '小姐', '夫人', '大人', '将军', '公子', '一樣', '一样', '現在', '现在',
  '以後', '以后', '以前', '這裡', '这里', '那裡', '那里', '還是', '还是', '明白',
])

function isChinese(ch: string) {
  const code = ch.charCodeAt(0)
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)
}

function isValidName(name: string): boolean {
  if (name.length < 2 || name.length > 4) return false
  if (BLACKLIST.has(name)) return false
  // 必須全部是中文字元
  return name.split('').every(isChinese)
}

// ── 從文字中提取候選人名 ──
function extractCandidatesFromText(text: string): string[] {
  const candidates: string[] = []

  // 1. 對話歸因：「XX說」「XX道」「XX問」
  const dialogueRe = new RegExp(`([\\u4e00-\\u9fff]{2,4})[${SPEECH_VERBS}][道了：:。]?`, 'g')
  let m: RegExpExecArray | null
  while ((m = dialogueRe.exec(text)) !== null) {
    candidates.push(m[1])
  }

  // 2. 後綴稱謂：「李先生」「王將軍」「趙公子」
  for (const suffix of TITLE_SUFFIXES) {
    const re = new RegExp(`([\\u4e00-\\u9fff]{1,3})${suffix}`, 'g')
    while ((m = re.exec(text)) !== null) {
      candidates.push(m[1])
    }
  }

  // 3. 前綴稱謂：「老王」「小李」
  for (const prefix of TITLE_PREFIXES) {
    const re = new RegExp(`${prefix}([\\u4e00-\\u9fff]{1,2})`, 'g')
    while ((m = re.exec(text)) !== null) {
      const candidate = prefix + m[1]
      candidates.push(candidate)
    }
  }

  // 4. 姓氏 + 1-2字名（緊跟在姓氏後的漢字序列）
  for (let i = 0; i < text.length - 1; i++) {
    if (COMMON_SURNAMES.has(text[i])) {
      for (let len = 2; len <= 3; len++) {
        if (i + len <= text.length) {
          const candidate = text.slice(i, i + len)
          if (candidate.split('').every(isChinese)) {
            candidates.push(candidate)
          }
        }
      }
    }
  }

  return candidates
}

// ── 主分析函數 ──
export function analyzeCharacters(sentences: string[]): CharacterGraph {
  // 過濾 PARA_SEP 和圖片句，全文分析
  const textSentences = sentences
    .filter(s => s && s !== ' ' && !s.startsWith('data:'))

  // 第一遍：統計候選人名出現次數
  const freq = new Map<string, number>()
  const dialogueCount = new Map<string, number>()

  const dialogueRe = new RegExp(`([\\u4e00-\\u9fff]{2,4})[${SPEECH_VERBS}][道了：:。]?`, 'g')

  for (const sentence of textSentences) {
    const candidates = extractCandidatesFromText(sentence)
    const seen = new Set<string>()
    for (const c of candidates) {
      if (!isValidName(c)) continue
      if (!seen.has(c)) {
        freq.set(c, (freq.get(c) ?? 0) + 1)
        seen.add(c)
      }
    }
    // 對話計數
    let m: RegExpExecArray | null
    dialogueRe.lastIndex = 0
    while ((m = dialogueRe.exec(sentence)) !== null) {
      if (isValidName(m[1])) {
        dialogueCount.set(m[1], (dialogueCount.get(m[1]) ?? 0) + 1)
      }
    }
  }

  // 篩選：動態門檻（短書低些，長書高些），取前 25 個
  // 全書句數 / 200 作為最小出現次數（最低 2，最高 15）
  const minCount = Math.min(15, Math.max(2, Math.floor(textSentences.length / 200)))
  const topChars: Character[] = Array.from(freq.entries())
    .filter(([name, count]) => count >= minCount && !BLACKLIST.has(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([name, count]) => ({
      name,
      count,
      dialogues: dialogueCount.get(name) ?? 0,
    }))

  if (topChars.length === 0) {
    return { characters: [], relations: [] }
  }

  const charSet = new Set(topChars.map(c => c.name))

  // 第二遍：計算共現關係
  const coOccur = new Map<string, number>()

  for (const sentence of textSentences) {
    // 找這句裡出現的所有主要人物
    const mentioned = new Set<string>()
    for (const char of charSet) {
      if (sentence.includes(char)) mentioned.add(char)
    }
    const mentionedArr = Array.from(mentioned)
    // 對每對人物記錄共現
    for (let i = 0; i < mentionedArr.length; i++) {
      for (let j = i + 1; j < mentionedArr.length; j++) {
        const key = [mentionedArr[i], mentionedArr[j]].sort().join('|')
        coOccur.set(key, (coOccur.get(key) ?? 0) + 1)
      }
    }
  }

  // 篩選關係：動態門檻
  const minRelation = Math.max(2, Math.floor(textSentences.length / 400))
  const relations: Relation[] = Array.from(coOccur.entries())
    .filter(([, strength]) => strength >= minRelation)
    .map(([key, strength]) => {
      const [source, target] = key.split('|')
      return { source, target, strength }
    })
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 40)

  return { characters: topChars, relations }
}
