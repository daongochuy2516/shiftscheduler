import { toDateKey } from './time'

/**
 * Gõ ngày bằng phím, dạng `dd/MM/yyyy` (DateInput, bộ lọc Tất cả ca).
 *
 * Chỉ giữ chữ số, tự chèn `/` sau ngày và tháng. Gõ `/` sau một chữ số thì
 * coi như đã xong phần đó và thêm số 0 phía trước: `1/10/2026` → `01/10/2026`.
 */
export function maskDateText(raw: string): string {
  const segs = raw.split('/')
  let digits = ''
  segs.forEach((seg, i) => {
    const d = seg.replace(/\D/g, '')
    // Phần ngày / tháng đã có dấu `/` đứng sau mà mới một chữ số.
    const closed = i < segs.length - 1 && i < 2
    digits += closed && d.length === 1 ? `0${d}` : d
  })
  digits = digits.slice(0, 8)
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
  return parts.filter(Boolean).join('/')
}

/** `dd/MM/yyyy` đủ và có thật → `yyyy-MM-dd`; còn lại `null` (31/02, năm 0002…). */
export function parseDateText(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!m) return null
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (year < 1900) return null
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }
  return toDateKey(d)
}

/** `yyyy-MM-dd` → `dd/MM/yyyy`. */
export function formatDateText(key: string): string {
  if (!key) return ''
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}
