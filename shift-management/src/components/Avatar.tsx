import { initials, personColorKey, type PersonColorKey } from '../lib/colors'

// Tông lấy theo `personColorKey` (cùng hash với khối lịch tuần) để màu ảnh
// đại diện và màu khối của một người không bao giờ lệch nhau.
const TONES: Record<PersonColorKey, string> = {
  indigo: 'bg-indigo-100 text-indigo-700',
  teal: 'bg-teal-100 text-teal-700',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
}

function tone(seed: string): string {
  return TONES[personColorKey(seed)]
}

export function Avatar({
  name,
  seed,
  size = 'md',
}: {
  name: string
  seed?: string
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${tone(
        seed ?? name,
      )} ${size === 'sm' ? 'h-6 w-6 text-[11px]' : 'h-8 w-8 text-xs'}`}
    >
      {initials(name)}
    </span>
  )
}
