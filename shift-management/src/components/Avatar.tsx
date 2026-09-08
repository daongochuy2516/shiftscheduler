import { initials } from '../lib/colors'

const TONES = [
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
]

function tone(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
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
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${tone(
        seed ?? name,
      )} ${size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'}`}
    >
      {initials(name)}
    </span>
  )
}
