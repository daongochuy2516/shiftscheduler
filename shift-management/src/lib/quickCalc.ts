import { addDays, addMinutes, differenceInCalendarDays, isValid } from 'date-fns'
import { fromDateKey, toDateKey } from './time'

/**
 * Máy tính của bảng lệnh nhanh (Ctrl + K). Hàm thuần: nhận chuỗi người dùng
 * gõ, trả về các cách hiểu được — không bao giờ `eval`.
 *
 * Hiểu được:
 *   - phép tính số:          12*3+4 · (1+2)^3 · 10 % 3
 *   - giờ ± thời lượng:      08:00 + 4h30m · 22:00 + 3h  (→ 01:00 hôm sau)
 *   - giờ - giờ:             17:30 - 08:15  (→ 9h 15m)
 *   - thời lượng:            90m · 1h30 + 45m · 2 giờ 15 phút
 *   - ngày ± số ngày/tuần:   hôm nay + 10 ngày · 15/10 - 2w · today + 3
 *   - ngày - ngày:           20/12 - 15/10  (→ 66 ngày)
 *   - bây giờ ± thời lượng:  now + 90m
 *
 * Một chuỗi có thể có nhiều cách hiểu ("15/10" vừa là 1,5 vừa là ngày 15/10),
 * nên trả về danh sách.
 */
export type CalcResult =
  | { kind: 'number'; value: number }
  /** Giờ trong ngày (phút từ 0:00) và số ngày lệch đi so với ngày gốc. */
  | { kind: 'time'; minutes: number; dayOffset: number }
  | { kind: 'duration'; minutes: number }
  /** yyyy-MM-dd */
  | { kind: 'date'; date: string }
  | { kind: 'days'; days: number }
  | { kind: 'datetime'; at: Date }

export function quickCalc(input: string, now: Date = new Date()): CalcResult[] {
  const raw = input.trim()
  if (!raw) return []
  const out: CalcResult[] = []
  const num = arithmetic(raw)
  if (num !== null) out.push({ kind: 'number', value: num })
  const temporal = temporalExpr(raw, now)
  // Có dạng ngày (15/10) thì gần như chắc là muốn ngày — xếp trước phép chia.
  if (temporal && /\d{1,2}\/\d{1,2}/.test(raw)) out.unshift(temporal)
  else if (temporal) out.push(temporal)
  return out
}

// ---------------------------------------------------------------- số học

/** Phép tính số thuần, cần ít nhất một toán tử. `null` nếu không phải. */
function arithmetic(src: string): number | null {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')
  if (!/^[\d.+\-*/%^()]+$/.test(s) || !/[+\-*/%^]/.test(s.replace(/^-/, ''))) {
    return null
  }
  let i = 0
  const eat = (c: string) => (s[i] === c ? (i++, true) : false)

  function expr(): number {
    let v = term()
    for (;;) {
      if (eat('+')) v += term()
      else if (eat('-')) v -= term()
      else return v
    }
  }
  function term(): number {
    let v = power()
    for (;;) {
      if (eat('*')) v *= power()
      else if (eat('/')) v /= power()
      else if (eat('%')) v %= power()
      else return v
    }
  }
  function power(): number {
    const base = unary()
    return eat('^') ? base ** power() : base
  }
  function unary(): number {
    if (eat('-')) return -unary()
    if (eat('+')) return unary()
    return primary()
  }
  function primary(): number {
    if (eat('(')) {
      const v = expr()
      if (!eat(')')) throw new Error('paren')
      return v
    }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(s.slice(i))
    if (!m) throw new Error('number')
    i += m[0].length
    return Number(m[0])
  }

  try {
    const v = expr()
    if (i !== s.length || !Number.isFinite(v)) return null
    return v
  } catch {
    return null
  }
}

// ------------------------------------------------------- ngày, giờ, thời lượng

type Value =
  | { t: 'time'; minutes: number; dayOffset: number }
  | { t: 'duration'; minutes: number }
  | { t: 'date'; date: string }
  | { t: 'days'; days: number }
  | { t: 'datetime'; at: Date }
  | { t: 'number'; n: number }

/** Bỏ dấu, chữ thường: "Ngày" → "ngay", "giờ" → "gio". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
}

const UNIT: Record<string, 'h' | 'm' | 'd' | 'w'> = {
  h: 'h', g: 'h', gio: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h', tieng: 'h',
  m: 'm', p: 'm', ph: 'm', phut: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  d: 'd', ngay: 'd', day: 'd', days: 'd',
  w: 'w', tuan: 'w', week: 'w', weeks: 'w',
}

const KEYWORDS: [RegExp, (now: Date) => Value][] = [
  [/^(hom ?nay|today)/, (now) => ({ t: 'date', date: toDateKey(now) })],
  [/^(ngay ?mai|tomorrow)/, (now) => ({ t: 'date', date: toDateKey(addDays(now, 1)) })],
  [/^(hom ?qua|yesterday)/, (now) => ({ t: 'date', date: toDateKey(addDays(now, -1)) })],
  [/^(bay ?gio|now)/, (now) => ({ t: 'datetime', at: now })],
]

/** Đọc một giá trị ở đầu `s`; trả giá trị và phần còn lại. */
function readValue(s: string, now: Date): [Value, string] | null {
  for (const [re, make] of KEYWORDS) {
    const m = re.exec(s)
    if (m) return [make(now), s.slice(m[0].length)]
  }

  // yyyy-mm-dd
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) {
    const date = makeDate(+m[1], +m[2], +m[3])
    return date ? [{ t: 'date', date }, s.slice(m[0].length)] : null
  }
  // dd/mm[/yyyy]
  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(s)
  if (m) {
    const year = m[3]
      ? m[3].length === 2
        ? 2000 + +m[3]
        : +m[3]
      : now.getFullYear()
    const date = makeDate(year, +m[2], +m[1])
    return date ? [{ t: 'date', date }, s.slice(m[0].length)] : null
  }
  // HH:mm
  m = /^(\d{1,2}):(\d{2})/.exec(s)
  if (m) {
    const h = +m[1]
    const min = +m[2]
    if (h > 24 || min > 59) return null
    return [{ t: 'time', minutes: h * 60 + min, dayOffset: 0 }, s.slice(m[0].length)]
  }

  // Thời lượng ghép: 4h30m · 4h30 · 1 giờ 30 phút · 2d · 3 ngay
  let rest = s
  let minutes = 0
  let days = 0
  let parts = 0
  let lastUnit: string | null = null
  for (;;) {
    const n = /^(\d+(?:\.\d+)?)\s*([a-z]*)\s*/.exec(rest)
    if (!n) break
    const unit = n[2] ? UNIT[n[2]] : undefined
    if (n[2] && !unit) break
    if (!unit) {
      // "4h30": số trần ngay sau giờ là phút.
      if (lastUnit === 'h' && parts > 0) {
        minutes += +n[1]
        rest = rest.slice(n[0].length)
        parts++
        lastUnit = 'm'
        continue
      }
      break
    }
    const v = +n[1]
    if (unit === 'h') minutes += v * 60
    else if (unit === 'm') minutes += v
    else if (unit === 'd') days += v
    else days += v * 7
    rest = rest.slice(n[0].length)
    parts++
    lastUnit = unit
  }
  if (parts > 0) {
    if (minutes === 0 && days > 0) return [{ t: 'days', days }, rest]
    return [{ t: 'duration', minutes: Math.round(minutes + days * 1440) }, rest]
  }

  // Số trần (ví dụ "hôm nay + 3": hiểu là số ngày, xử lý ở combine).
  m = /^(\d+(?:\.\d+)?)/.exec(s)
  if (m) return [{ t: 'number', n: +m[1] }, s.slice(m[0].length)]
  return null
}

function makeDate(y: number, mo: number, d: number): string | null {
  const date = new Date(y, mo - 1, d)
  if (!isValid(date) || date.getMonth() !== mo - 1 || date.getDate() !== d) {
    return null
  }
  return toDateKey(date)
}

function combine(a: Value, op: '+' | '-', b: Value): Value | null {
  const sign = op === '+' ? 1 : -1
  // Số trần cạnh ngày = số ngày.
  if (b.t === 'number' && (a.t === 'date' || a.t === 'datetime' || a.t === 'days')) {
    b = { t: 'days', days: b.n }
  }
  switch (a.t) {
    case 'date':
      if (b.t === 'days') {
        return { t: 'date', date: toDateKey(addDays(fromDateKey(a.date), sign * b.days)) }
      }
      if (b.t === 'duration' && b.minutes % 1440 === 0) {
        return { t: 'date', date: toDateKey(addDays(fromDateKey(a.date), (sign * b.minutes) / 1440)) }
      }
      if (b.t === 'date' && op === '-') {
        return { t: 'days', days: differenceInCalendarDays(fromDateKey(a.date), fromDateKey(b.date)) }
      }
      return null
    case 'time': {
      if (b.t === 'duration') {
        const total = a.dayOffset * 1440 + a.minutes + sign * b.minutes
        return {
          t: 'time',
          minutes: ((total % 1440) + 1440) % 1440,
          dayOffset: Math.floor(total / 1440),
        }
      }
      if (b.t === 'time' && op === '-') {
        let diff = a.minutes - b.minutes
        // 02:00 - 22:00: hiểu là qua đêm, 4 tiếng — không phải -20 tiếng.
        if (diff < 0) diff += 1440
        return { t: 'duration', minutes: diff }
      }
      return null
    }
    case 'duration':
      if (b.t === 'duration') return { t: 'duration', minutes: Math.max(0, a.minutes + sign * b.minutes) }
      if (b.t === 'days') return { t: 'duration', minutes: Math.max(0, a.minutes + sign * b.days * 1440) }
      return null
    case 'days':
      if (b.t === 'days') return { t: 'days', days: a.days + sign * b.days }
      return null
    case 'datetime':
      if (b.t === 'duration') return { t: 'datetime', at: addMinutes(a.at, sign * b.minutes) }
      if (b.t === 'days') return { t: 'datetime', at: addDays(a.at, sign * b.days) }
      return null
    case 'number':
      return null
  }
}

/** Chuỗi giá trị nối bằng + / -, tính từ trái sang phải. */
function temporalExpr(src: string, now: Date): CalcResult | null {
  let s = fold(src).replace(/\s+/g, ' ').trim()
  const first = readValue(s, now)
  if (!first) return null
  let [acc, rest] = first
  s = rest.trim()
  let ops = 0
  while (s) {
    const op = s[0]
    if (op !== '+' && op !== '-') return null
    const next = readValue(s.slice(1).trim(), now)
    if (!next) return null
    const combined = combine(acc, op, next[0])
    if (!combined) return null
    acc = combined
    s = next[1].trim()
    ops++
  }

  // Một giá trị đứng riêng: chỉ đáng hiện khi có gì để nói — ngày (mở lịch),
  // hay thời lượng ghép (đổi đơn vị). "08:00" hay "5" đứng riêng thì bỏ.
  if (ops === 0 && (acc.t === 'time' || acc.t === 'number' || acc.t === 'datetime')) {
    return null
  }
  switch (acc.t) {
    case 'time':
      return { kind: 'time', minutes: acc.minutes, dayOffset: acc.dayOffset }
    case 'duration':
      return { kind: 'duration', minutes: acc.minutes }
    case 'date':
      return { kind: 'date', date: acc.date }
    case 'days':
      return { kind: 'days', days: acc.days }
    case 'datetime':
      return { kind: 'datetime', at: acc.at }
    case 'number':
      return null
  }
}
