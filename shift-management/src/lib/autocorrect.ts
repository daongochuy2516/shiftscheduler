/**
 * Sửa chữ bị bộ gõ tiếng Việt (EVKey, Unikey… kiểu Telex) "sửa giùm" khi gõ
 * nhanh từ tiếng Anh trong Quick Search (Ctrl + K): `dark` → `dảk` (r là dấu
 * hỏi), `theme` → `thêm` (e…e là ê).
 *
 * Chỉ dùng khi chữ gốc không khớp lệnh nào — gõ tiếng Việt thật ("sáng",
 * "tối", "thêm ca") vẫn tìm như cũ.
 */

/**
 * BẢNG SỬA TAY — thêm / sửa thoải mái.
 *
 * Khoá: chữ bị bộ gõ biến thành (viết thường, giữ nguyên dấu).
 * Giá trị: chữ bạn định gõ.
 *
 * Bộ gỡ Telex bên dưới đã tự lo phần lớn trường hợp; chỉ cần thêm vào đây
 * những chữ nó đoán sai hoặc không đoán ra. Bảng này được thử trước bộ gỡ.
 */
export const TYPO_FIXES: Record<string, string> = {
  dảk: 'dark',
  thêm: 'theme',
  // ví dụ: 'ưhatever': 'whatever',
}

// ---------------------------------------------------------------------------
// Bộ gỡ Telex: từ chữ có dấu suy ngược ra các phím đã gõ.
// ---------------------------------------------------------------------------

/** Dấu thanh (dấu kết hợp Unicode) → phím Telex. */
const TONE_KEY: Record<string, string> = {
  '́': 's', // sắc
  '̀': 'f', // huyền
  '̉': 'r', // hỏi
  '̃': 'x', // ngã
  '̣': 'j', // nặng
}

/** Dấu mũ / trăng / móc → phím Telex. Dấu mũ là gõ lặp lại chính chữ đó. */
function shapeKey(mark: string, base: string): string | null {
  if (mark === '̂') return base // â ê ô: aa ee oo
  if (mark === '̆' || mark === '̛') return 'w' // ă ơ ư: aw ow uw
  return null
}

interface Letter {
  base: string
  shape: string
  tone: string
}

function letters(word: string): Letter[] {
  const out: Letter[] = []
  for (const ch of word.normalize('NFC')) {
    if (ch === 'đ') {
      out.push({ base: 'd', shape: 'd', tone: '' })
      continue
    }
    const [base, ...marks] = ch.normalize('NFD')
    let shape = ''
    let tone = ''
    for (const m of marks) {
      if (TONE_KEY[m]) tone = TONE_KEY[m]
      else shape = shapeKey(m, base) ?? shape
    }
    out.push({ base, shape, tone })
  }
  return out
}

const MAX_CANDIDATES = 12

/**
 * Các cách gõ có thể đã sinh ra `word`, chưa biết cách nào đúng. Bộ gõ cho đặt
 * phím dấu ngay sau chữ, hoặc dồn về cuối từ (`statu` + `s` → `statú`), nên
 * thử cả hai chỗ.
 */
export function untelex(word: string): string[] {
  const ls = letters(word.toLowerCase())
  if (!ls.some((l) => l.shape || l.tone)) return []

  const bases = ls.map((l) => l.base).join('')
  const shapes = ls.map((l) => l.shape).join('')
  const tones = ls.map((l) => l.tone).join('')
  const inline = ls.map((l) => l.base + l.shape + l.tone).join('')
  const toneEnd = ls.map((l) => l.base + l.shape).join('') + tones
  const allEnd = bases + shapes + tones

  const found = new Set([inline, toneEnd, allEnd])
  // Telex gõ một chữ `w` cũng ra `ư`: thử thêm bản bỏ chữ `u` đứng trước `w`.
  for (const c of [...found]) {
    if (c.includes('uw')) found.add(c.replaceAll('uw', 'w'))
  }
  return [...found].slice(0, MAX_CANDIDATES)
}

/**
 * Các cách hiểu của một từ trong ô tìm, thứ tự ưu tiên: bảng sửa tay rồi tới
 * bộ gỡ Telex. Không gồm chính từ đó.
 */
export function corrections(word: string): string[] {
  const key = word.toLowerCase().normalize('NFC')
  const manual = TYPO_FIXES[key]
  const out = manual ? [manual.toLowerCase()] : []
  for (const c of untelex(key)) if (!out.includes(c)) out.push(c)
  return out
}
