export interface ShiftColor {
  /** Timeline block surface. */
  block: string
  /** Small square/dot used in legends and lists. */
  dot: string
  /** Pill used next to shift titles in list views. */
  chip: string
}

/**
 * Classes are written out in full so the Tailwind scanner can see them —
 * they must never be assembled from fragments at runtime.
 */
const PALETTE: ShiftColor[] = [
  {
    block: 'bg-indigo-50 border-indigo-300 text-indigo-950 hover:bg-indigo-100',
    dot: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  {
    block: 'bg-teal-50 border-teal-300 text-teal-950 hover:bg-teal-100',
    dot: 'bg-teal-500',
    chip: 'bg-teal-50 text-teal-700 ring-teal-200',
  },
  {
    block: 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100',
    dot: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  {
    block: 'bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  {
    block: 'bg-sky-50 border-sky-300 text-sky-950 hover:bg-sky-100',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-200',
  },
  {
    block: 'bg-violet-50 border-violet-300 text-violet-950 hover:bg-violet-100',
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  {
    block: 'bg-lime-50 border-lime-300 text-lime-950 hover:bg-lime-100',
    dot: 'bg-lime-500',
    chip: 'bg-lime-50 text-lime-700 ring-lime-200',
  },
]

/** Stable colour per shift id, so a shift keeps its colour across reloads. */
export function shiftColor(shiftId: string): ShiftColor {
  let hash = 0
  for (let i = 0; i < shiftId.length; i++) {
    hash = (hash * 31 + shiftId.charCodeAt(i)) >>> 0
  }
  return PALETTE[hash % PALETTE.length]
}

/** "Huy Nguyen" → "HN" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
