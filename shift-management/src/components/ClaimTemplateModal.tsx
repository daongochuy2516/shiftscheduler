import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { AlertTriangle, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Location, ShiftTemplate, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { useSchedule, useShifts } from '../data/ScheduleContext'
import { formatRange, fromDateKey, toDateKey } from '../lib/time'
import { useNotify } from '../notifications/NotificationContext'
import { SHIFT_COLOR_KEYS, colorByKey, templateColor, type ShiftColorKey } from '../lib/colors'
import { activeLocations } from '../lib/locations'
import { locationsLocked } from '../lib/attendance'
import { Modal } from './Modal'

type PickerMode = 'week' | 'month'

/** Nơi trực chọn lần trước, nhớ riêng từng người trên máy này. */
const locationStorageKey = (userId: UUID) => `scheduler.claimLocations.${userId}`

function readSavedLocations(userId: UUID | undefined): UUID[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(locationStorageKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((id): id is UUID => typeof id === 'string')
      : []
  } catch {
    // Chế độ riêng tư / bộ nhớ bị chặn / chuỗi hỏng: coi như chưa chọn gì.
    return []
  }
}

function saveLocations(userId: UUID, ids: UUID[]) {
  try {
    localStorage.setItem(locationStorageKey(userId), JSON.stringify(ids))
  } catch {
    // Không nhớ được thì lần sau chọn lại — không ảnh hưởng việc nhận ca.
  }
}

function isColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

/** Lớp của chip nơi trực đang được chọn — màu của chính nơi trực đó. */
function pickedChipClass(location: Location): string {
  return isColorKey(location.color)
    ? `${colorByKey(location.color).chip} border-transparent ring-2`
    : 'border-transparent bg-slate-100 text-slate-700 ring-2 ring-slate-300'
}

/**
 * Asks which day(s) to claim a recurring template for, instead of silently
 * using whatever day the timeline happens to be showing.
 */
export function ClaimTemplateModal({
  template,
  viewedDate,
  onClose,
}: {
  template: ShiftTemplate
  /** The day the schedule page is currently showing. */
  viewedDate: Date
  onClose: () => void
}) {
  const { t, dateLocale } = useI18n()
  const { user } = useAuth()
  const { claimTemplate, locations, locationsAvailable, locationsLoaded, refresh } =
    useSchedule()

  const [mode, setMode] = useState<PickerMode>('month')
  const [cursor, setCursor] = useState<Date>(viewedDate)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set([toDateKey(viewedDate)]),
  )
  const [saving, setSaving] = useState(false)
  const notify = useNotify()

  // ---- locations ----
  const pickable = useMemo(
    () => (locationsAvailable ? activeLocations(locations) : []),
    [locations, locationsAvailable],
  )
  /**
   * Đã chạy 012 thì nhận ca luôn phải kèm ít nhất một nơi trực (015 chặn ở
   * database). Chưa chạy 012 thì không có luật này, bỏ qua cả phần chọn.
   */
  const needLocations = locationsAvailable
  /**
   * Bắt buộc chọn mà admin chưa tạo / đã ẩn hết nơi trực: nhận ca là không thể,
   * database cũng sẽ từ chối, nên nói rõ phải nhờ ai thay vì để bấm rồi lỗi.
   */
  const noLocations = needLocations && pickable.length === 0
  /**
   * Danh sách rỗng vì tải lỗi (vd vào app lúc offline), không phải vì chưa có
   * nơi trực: báo tải lỗi và cho thử lại, đừng bảo đi nhờ admin.
   */
  const locationsFailed = noLocations && !locationsLoaded
  const [retrying, setRetrying] = useState(false)

  async function retryLocations() {
    setRetrying(true)
    try {
      await refresh()
    } finally {
      setRetrying(false)
    }
  }
  // Giữ nguyên id đã lưu (kể cả id nay đã ẩn / xoá); chỉ lọc lúc dùng, để
  // danh sách nơi trực nạp muộn hơn modal vẫn khớp lại được.
  const [pickedRaw, setPickedRaw] = useState<Set<UUID>>(
    () => new Set(readSavedLocations(user?.id)),
  )
  const [locationError, setLocationError] = useState(false)
  /** Nơi trực đang chọn, chỉ những nơi còn chọn được, theo thứ tự hiển thị. */
  const pickedIds = useMemo(
    () => pickable.filter((l) => pickedRaw.has(l.id)).map((l) => l.id),
    [pickable, pickedRaw],
  )

  function toggleLocation(id: UUID) {
    setLocationError(false)
    setPickedRaw((prev) => {
      // Bỏ luôn id cũ không còn chọn được để chúng không quay lại lần sau.
      const next = new Set([...prev].filter((x) => pickable.some((l) => l.id === x)))
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const todayKey = toDateKey(new Date())
  const color = templateColor(template)

  /** Empty weekdays means the template repeats every day. */
  const isRepeatDay = (day: Date) =>
    template.weekdays.length === 0 || template.weekdays.includes(day.getDay())

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(cursor, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    }
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
    })
  }, [mode, cursor])

  // Chỉ tải những ngày đang hiện trên lịch chọn. Chưa tải xong thì ô "đã
  // nhận" chưa kịp tô, nhưng không sao: nhận trùng một ngày là no-op ở
  // backend (hoặc chỉ thêm nơi trực mới vào lượt sẵn có), không tạo ca hay
  // phân công thừa.
  const { shifts } = useShifts({
    kind: 'range',
    from: toDateKey(days[0]),
    to: toDateKey(days[days.length - 1]),
  })

  /**
   * Days this template is already claimed by the signed-in user, with the
   * locations their assignment that day already covers — or `null` when that
   * assignment can't take new locations any more (already checked in).
   */
  const claimedLocations = useMemo(() => {
    const map = new Map<string, Set<UUID> | null>()
    for (const shift of shifts) {
      if (shift.template_id !== template.id) continue
      const mine = shift.assignments.find((a) => a.user_id === user?.id)
      if (!mine) continue
      // Both backends treat re-claiming a confirmed assignment as a no-op (a
      // staff UPDATE there would be rejected and stop the remaining days), so
      // such a day is plainly "claimed", never "add locations".
      const locked = mine.status === 'confirmed' || locationsLocked(mine, user)
      map.set(shift.date, locked ? null : new Set(mine.location_ids))
    }
    return map
  }, [shifts, template.id, user])

  /**
   * Claimed days that can't be picked: nothing new would happen there. A
   * claimed day stays pickable while the chosen locations include one the
   * assignment lacks — claiming it then adds those locations (backend union).
   */
  const blockedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const [date, has] of claimedLocations) {
      if (!has || !pickedIds.some((id) => !has.has(id))) keys.add(date)
    }
    return keys
  }, [claimedLocations, pickedIds])

  /** At least one claimed day on screen could still take new locations. */
  const anyCanAdd = useMemo(
    () => [...claimedLocations.values()].some((has) => has !== null),
    [claimedLocations],
  )

  /**
   * Selected days minus those that became blocked after the location choice
   * changed — kept in `selected` so picking the location back restores them.
   */
  const effectiveSelected = useMemo(
    () => [...selected].filter((key) => !blockedKeys.has(key)).sort(),
    [selected, blockedKeys],
  )

  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(monday, i), 'EEEEEE', { locale: dateLocale }),
    )
  }, [dateLocale])

  function toggle(day: Date) {
    const key = toDateKey(day)
    if (blockedKeys.has(key)) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function pickOnly(day: Date) {
    const key = toDateKey(day)
    if (blockedKeys.has(key)) return
    setSelected(new Set([key]))
    setCursor(day)
  }

  /** Adds every repeat day of the given week that isn't claimed already. */
  function addWeekRepeats(weekOffset: number) {
    const start = startOfWeek(addWeeks(new Date(), weekOffset), {
      weekStartsOn: 1,
    })
    setSelected((prev) => {
      const next = new Set(prev)
      for (let i = 0; i < 7; i++) {
        const day = addDays(start, i)
        const key = toDateKey(day)
        if (isRepeatDay(day) && !blockedKeys.has(key)) next.add(key)
      }
      return next
    })
    setCursor(start)
  }

  const viewedKey = toDateKey(viewedDate)
  const tomorrowKey = toDateKey(addDays(new Date(), 1))
  const showViewedChip = viewedKey !== todayKey && viewedKey !== tomorrowKey

  const headingText =
    mode === 'week'
      ? `${format(startOfWeek(cursor, { weekStartsOn: 1 }), 'd MMM', {
          locale: dateLocale,
        })} – ${format(endOfWeek(cursor, { weekStartsOn: 1 }), 'd MMM yyyy', {
          locale: dateLocale,
        })}`
      : format(cursor, 'MMMM yyyy', { locale: dateLocale })

  function step(direction: 1 | -1) {
    setCursor((c) =>
      mode === 'week' ? addWeeks(c, direction) : addMonths(c, direction),
    )
  }

  async function handleClaim() {
    if (!user || effectiveSelected.length === 0 || noLocations) return
    if (needLocations && pickedIds.length === 0) {
      setLocationError(true)
      return
    }
    setSaving(true)
    // Sorted so a partial failure leaves the earliest days done.
    const dates = effectiveSelected
    const params = { title: template.title, count: dates.length }
    try {
      await claimTemplate(template.id, dates, user.id, pickedIds)
      if (needLocations) saveLocations(user.id, pickedIds)
      notify.success(
        'notif.claim.done',
        params,
        dates.map((d) => format(fromDateKey(d), 'd/M')).join(', '),
      )
      onClose()
    } catch (err) {
      notify.notify({
        kind: 'error',
        title: 'notif.claim.failed',
        params,
        body: `${err instanceof Error ? err.message : t('tpl.errClaim')} ${
          dates.length > 1 ? t('claim.partialError') : ''
        }`.trim(),
      })
      setSaving(false)
    }
  }

  const chipClass =
    'rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700'

  return (
    <Modal
      title={t('claim.title')}
      subtitle={t('claim.subtitle', { title: template.title })}
      onClose={onClose}
      width="max-w-lg"
      footer={
        <>
          <span className="mr-auto text-sm text-slate-600">
            {effectiveSelected.length === 0
              ? t('claim.none')
              : t('claim.selected', { count: effectiveSelected.length })}
          </span>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            onClick={onClose}
            disabled={saving}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-tour="claim-submit"
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleClaim}
            disabled={saving || effectiveSelected.length === 0 || noLocations}
          >
            {saving
              ? t('tpl.claiming')
              : t('claim.action', { count: effectiveSelected.length })}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ---- which shift ---- */}
        <div
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 ${color.block}`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${color.dot}`} />
          <span className="text-sm font-semibold">{template.title}</span>
          <span className="text-xs opacity-75">
            {formatRange(template.start_time, template.end_time)}
          </span>
        </div>

        {/* ---- locations ---- */}
        {noLocations && (
          <div
            data-tour="claim-locations"
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">
              {t(locationsFailed ? 'claim.locationsNotLoaded' : 'claim.noLocations')}
            </span>
            {locationsFailed && (
              <button
                type="button"
                onClick={() => void retryLocations()}
                disabled={retrying}
                className="-my-1 min-h-11 shrink-0 rounded-md px-2 text-sm font-semibold text-amber-900 underline-offset-2 hover:underline disabled:opacity-60 sm:min-h-0 sm:py-1"
              >
                {t('claim.retryLocations')}
              </button>
            )}
          </div>
        )}
        {needLocations && !noLocations && (
          <div data-tour="claim-locations">
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              {t('claim.locations')}
            </p>
            <div
              role="group"
              aria-label={t('claim.locations')}
              className="flex flex-wrap gap-1.5"
            >
              {pickable.map((location) => {
                const on = pickedIds.includes(location.id)
                return (
                  <button
                    key={location.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleLocation(location.id)}
                    className={`inline-flex min-h-11 max-w-full min-w-11 items-center justify-center gap-1 rounded-full border px-3 text-sm font-medium transition sm:min-h-0 sm:py-1 sm:text-xs ${
                      on
                        ? pickedChipClass(location)
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{location.name}</span>
                  </button>
                )
              })}
            </div>
            {locationError ? (
              <p className="mt-1 text-xs text-rose-600">
                {t('claim.errLocationRequired')}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {t('claim.locationsHint')}
                {anyCanAdd && ` ${t('claim.claimedAddsLocations')}`}
              </p>
            )}
          </div>
        )}

        {/* ---- quick picks ---- */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">
            {t('claim.quick')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className={chipClass}
              onClick={() => pickOnly(new Date())}
            >
              {t('claim.today')}
            </button>
            <button
              type="button"
              className={chipClass}
              onClick={() => pickOnly(addDays(new Date(), 1))}
            >
              {t('claim.tomorrow')}
            </button>
            {showViewedChip && (
              <button
                type="button"
                className={chipClass}
                onClick={() => pickOnly(viewedDate)}
              >
                {t('claim.viewedDay')} ·{' '}
                {format(viewedDate, 'd/M', { locale: dateLocale })}
              </button>
            )}
            <button
              type="button"
              className={chipClass}
              onClick={() => addWeekRepeats(0)}
            >
              {t('claim.thisWeek')}
            </button>
            <button
              type="button"
              className={chipClass}
              onClick={() => addWeekRepeats(1)}
            >
              {t('claim.nextWeek')}
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setSelected(new Set())}
              >
                {t('claim.clear')}
              </button>
            )}
          </div>
        </div>

        {/* ---- calendar ---- */}
        <div data-tour="claim-days" className="rounded-lg border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={mode === 'week' ? t('view.prevWeek') : t('view.prevMonth')}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-slate-800 capitalize">
              {headingText}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={mode === 'week' ? t('view.nextWeek') : t('view.nextMonth')}
              className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <div className="ml-auto flex rounded-md bg-slate-100 p-0.5">
              {(['week', 'month'] as PickerMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                    mode === m
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m === 'week' ? t('view.week') : t('view.month')}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 px-1.5 pt-1.5">
            {weekdayLabels.map((label) => (
              <div
                key={label}
                className="pb-1 text-center text-[11px] font-medium text-slate-500 capitalize"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 px-1.5 pb-1.5">
            {days.map((day) => {
              const key = toDateKey(day)
              /** Claimed and nothing to add: a plain "done" cell. */
              const isClaimed = blockedKeys.has(key)
              /** Claimed, but picking it adds the chosen locations. */
              const canAdd = !isClaimed && claimedLocations.has(key)
              const isSelected = !isClaimed && selected.has(key)
              const repeats = isRepeatDay(day)
              const isToday = key === todayKey
              const outsideMonth = mode === 'month' && !isSameMonth(day, cursor)
              const isPast = key < todayKey

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(day)}
                  disabled={isClaimed}
                  data-tooltip={
                    isClaimed
                      ? t('claim.alreadyClaimed')
                      : canAdd
                        ? t('claim.addLocations')
                        : !repeats
                          ? t('claim.notRepeatDay')
                          : format(day, 'EEEE, d MMMM', { locale: dateLocale })
                  }
                  className={`relative flex h-10 flex-col items-center justify-center rounded-md border text-sm transition ${
                    isClaimed
                      ? 'cursor-default border-emerald-200 bg-emerald-50 text-emerald-700'
                      : isSelected
                        ? 'border-indigo-600 bg-indigo-600 font-semibold text-white'
                        : canAdd
                          ? 'border-dashed border-emerald-400 bg-emerald-50 text-emerald-700 hover:border-indigo-400 hover:bg-indigo-50'
                          : 'border-transparent hover:border-indigo-300 hover:bg-indigo-50'
                  } ${
                    !isClaimed && !isSelected && !canAdd
                      ? repeats
                        ? 'text-slate-800'
                        : 'text-slate-400'
                      : ''
                  } ${outsideMonth && !isSelected && !isClaimed ? 'opacity-45' : ''} ${
                    isPast && !isSelected && !isClaimed ? 'opacity-60' : ''
                  } ${isToday && !isSelected && !isClaimed ? 'ring-1 ring-indigo-400' : ''}`}
                >
                  {isClaimed || canAdd ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    format(day, 'd')
                  )}
                  {repeats && !isClaimed && !isSelected && !canAdd && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-indigo-400" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ---- legend ---- */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-indigo-600" />
            {t('claim.legendSelected')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border border-emerald-200 bg-emerald-50" />
            {t('claim.legendClaimed')}
          </li>
          {needLocations && anyCanAdd && (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-dashed border-emerald-400 bg-emerald-50" />
              {t('claim.legendAddLocations')}
            </li>
          )}
          <li className="flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-indigo-400" />
            {t('tpl.repeatOn')}
          </li>
        </ul>
      </div>
    </Modal>
  )
}
