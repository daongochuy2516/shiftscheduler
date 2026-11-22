import type { Location, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { SHIFT_COLOR_KEYS, colorByKey, type ShiftColorKey } from '../lib/colors'
import { locationShortName, sortLocationIds } from '../lib/locations'

type ChipSize = 'xs' | 'sm'
export type ChipVariant = 'full' | 'short' | 'dot'

const SIZE: Record<ChipSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px] leading-none',
  sm: 'px-2 py-0.5 text-xs',
}

/** Nơi trực chưa chọn màu: nhãn xám trung tính. */
const NEUTRAL = 'bg-slate-100 text-slate-600 ring-slate-200'
/** Nơi trực đã bị xoá (id còn trong lượt nhưng không còn trong danh sách). */
const GONE = 'bg-slate-50 text-slate-400 ring-slate-200 italic'

function isColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

/**
 * Nhãn một nơi trực, màu theo `location.color` (lớp lấy từ `PALETTE` qua
 * `colorByKey`, không ghép chuỗi lúc chạy). `name` đè tên hiển thị — dùng
 * khi chỉ có tên (ví dụ `location_names` trong nhật ký). Không có `location`
 * lẫn `name` thì là nơi trực đã xoá: nhãn xám `loc.unknown`.
 */
export function LocationChip({
  location,
  name,
  size = 'sm',
  variant = 'full',
}: {
  location?: Location | null
  name?: string
  size?: ChipSize
  /**
   * Chỗ hẹp: `short` = tên tắt ("Page"), `dot` = chỉ chấm màu. Tên đầy đủ
   * khi đó nằm ở tooltip của phần tử cha.
   */
  variant?: ChipVariant
}) {
  const { t } = useI18n()
  const colorKey = location && isColorKey(location.color) ? location.color : null

  if (variant === 'dot') {
    return (
      <span
        aria-hidden
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          colorKey ? colorByKey(colorKey).dot : location ? 'bg-slate-400' : 'bg-slate-300'
        }`}
      />
    )
  }

  const label =
    variant === 'short' && location ? locationShortName(location) : (name ?? location?.name)
  const tone = !location
    ? label
      ? NEUTRAL
      : GONE
    : colorKey
      ? colorByKey(colorKey).chip
      : NEUTRAL
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center rounded-full font-medium ring-1 ring-inset ${tone} ${SIZE[size]}`}
    >
      <span className="truncate">
        {label ?? (variant === 'short' ? '?' : t('loc.unknown'))}
      </span>
    </span>
  )
}

/**
 * Hàng nhãn nơi trực của một lượt phân công, xếp theo `sort_order` rồi tên
 * (id lạ — nơi trực đã xoá — đứng cuối). Mảng rỗng thì không vẽ gì.
 */
export function LocationChips({
  ids,
  byId,
  size = 'sm',
  className = '',
}: {
  ids: readonly UUID[]
  byId: ReadonlyMap<UUID, Location>
  size?: ChipSize
  className?: string
}) {
  if (ids.length === 0) return null
  return (
    <span className={`inline-flex min-w-0 flex-wrap items-center gap-1 ${className}`}>
      {sortLocationIds(ids, byId).map((id) => (
        <LocationChip key={id} location={byId.get(id) ?? null} size={size} />
      ))}
    </span>
  )
}
