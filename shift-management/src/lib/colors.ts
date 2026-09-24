import type { Shift, ShiftTemplate, UUID } from '../types'

export interface ShiftColor {
  /** Timeline block surface. */
  block: string
  /** Small square/dot used in legends and lists. */
  dot: string
  /** Pill used next to shift titles in list views. */
  chip: string
}

export const SHIFT_COLOR_KEYS = [
  'indigo',
  'teal',
  'amber',
  'rose',
  'sky',
  'violet',
  'lime',
  'emerald',
  'orange',
  'fuchsia',
  'cyan',
] as const

export type ShiftColorKey = (typeof SHIFT_COLOR_KEYS)[number]

/**
 * Classes are written out in full so the Tailwind scanner can see them —
 * they must never be assembled from fragments at runtime.
 */
const PALETTE: Record<ShiftColorKey, ShiftColor> = {
  indigo: {
    block: 'bg-indigo-50 border-indigo-300 text-indigo-950 hover:bg-indigo-100',
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  teal: {
    block: 'bg-teal-50 border-teal-300 text-teal-950 hover:bg-teal-100',
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-700 ring-teal-200',
  },
  amber: {
    block: 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  rose: {
    block: 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  sky: {
    block: 'bg-sky-50 border-sky-300 text-sky-950 hover:bg-sky-100',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  violet: {
    block: 'bg-violet-50 border-violet-300 text-violet-950 hover:bg-violet-100',
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  lime: {
    block: 'bg-lime-50 border-lime-300 text-lime-950 hover:bg-lime-100',
    dot: 'bg-lime-500',
    chip: 'bg-lime-50 text-lime-700 ring-lime-200',
  },
  emerald: {
    block: 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  orange: {
    block: 'bg-orange-50 border-orange-300 text-orange-950 hover:bg-orange-100',
    dot: 'bg-orange-500',
    chip: 'bg-orange-50 text-orange-700 ring-orange-200',
  },
  fuchsia: {
    block: 'bg-fuchsia-50 border-fuchsia-300 text-fuchsia-950 hover:bg-fuchsia-100',
    dot: 'bg-fuchsia-500',
    chip: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  },
  cyan: {
    block: 'bg-cyan-50 border-cyan-300 text-cyan-950 hover:bg-cyan-100',
    dot: 'bg-cyan-500',
    chip: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  },
}

// Chỉ hash trong 7 màu gốc để ca thường đã có giữ nguyên màu cũ.
const HASH_KEYS = SHIFT_COLOR_KEYS.slice(0, 7)

function hashKey(id: string): ShiftColorKey {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  return HASH_KEYS[hash % HASH_KEYS.length]
}

function isShiftColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

export function colorByKey(key: ShiftColorKey): ShiftColor {
  return PALETTE[key]
}

/** Màu đã chọn của ca mẫu; ca mẫu chưa chọn màu thì hash theo id cho ổn định. */
export function templateColorKey(
  template: Pick<ShiftTemplate, 'id' | 'color'>,
): ShiftColorKey {
  return isShiftColorKey(template.color) ? template.color : hashKey(template.id)
}

export function templateColor(
  template: Pick<ShiftTemplate, 'id' | 'color'>,
): ShiftColor {
  return PALETTE[templateColorKey(template)]
}

/**
 * Ca tạo từ ca mẫu dùng màu của ca mẫu; ca tạo tay có màu ngẫu nhiên nhưng
 * cố định theo id, nên không đổi giữa các lần tải trang.
 */
export function shiftColor(
  shift: Pick<Shift, 'id' | 'template_id'>,
  templatesById: Map<UUID, ShiftTemplate>,
): ShiftColor {
  if (shift.template_id) {
    const template = templatesById.get(shift.template_id)
    return template
      ? templateColor(template)
      : PALETTE[hashKey(shift.template_id)]
  }
  return PALETTE[hashKey(shift.id)]
}

/** "Huy Nguyen" → "HN" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
