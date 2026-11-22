import { useEffect, useMemo, useState } from 'react'
import { addMinutes, format } from 'date-fns'
import {
  AlertTriangle,
  Check,
  EyeOff,
  Lock,
  LogOut,
  NotebookPen,
  Plus,
} from 'lucide-react'
import type {
  AssignmentInput,
  Location,
  ShiftWithAssignments,
  UUID,
} from '../types'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useShiftColor } from '../data/useShiftColor'
import { useI18n } from '../i18n/I18nContext'
import {
  checkInOpensAt,
  checkInWindow,
  hoursLocked,
  leaveDeadline,
  locationsLocked,
  removeBlock,
} from '../lib/attendance'
import { SHIFT_COLOR_KEYS, colorByKey, type ShiftColorKey } from '../lib/colors'
import {
  activeLocations,
  locationsById,
  normalizeLocationIds,
  sameLocationIds,
  sortLocationIds,
} from '../lib/locations'
import { uiRestricted } from '../lib/uiBypass'
import {
  formatDuration,
  formatRange,
  fromDateKey,
  isInvalidRange,
  normalizeTime,
  toMinutes,
} from '../lib/time'
import { Avatar } from './Avatar'
import { LocationChips } from './LocationChip'
import { StatusBadge } from './StatusBadge'

export type EditorRow = AssignmentInput & { key: string }

export interface JoinDraft {
  start_time: string
  end_time: string
  note: string | null
  location_ids: UUID[]
}

/** Nơi trực chưa chọn màu: xám trung tính, như `LocationChip`. */
const NEUTRAL_TONE = 'bg-slate-100 text-slate-600 ring-slate-200'
/** Id nơi trực đã bị xoá (mảng không có khoá ngoại nên id vẫn nằm lại). */
const GONE_TONE = 'bg-slate-50 text-slate-400 ring-slate-200 line-through'
/** Hằng để `useMemo` của bộ chọn không tính lại mỗi lần vẽ. */
const NO_IDS: readonly UUID[] = []

function isColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

function locationTone(location: Location | undefined): string {
  if (!location) return GONE_TONE
  return isColorKey(location.color) ? colorByKey(location.color).chip : NEUTRAL_TONE
}

/**
 * Chọn nhiều nơi trực cho một lượt. Chọn được những nơi đang bật; nơi đang
 * ẩn hay đã xoá mà lượt đang có (hoặc có ở bản đã lưu — `initial`) vẫn hiện
 * để bỏ ra / chọn lại, vì máy chủ chỉ kiểm tra những id mới thêm (012).
 * Khoá (`disabled`) thì chỉ còn hàng nhãn để xem. Chưa chạy 012, hay chưa có
 * nơi trực nào để chọn, thì không vẽ gì.
 *
 * Giá trị luôn ở dạng chuẩn (`normalizeLocationIds`) để so "đã sửa chưa"
 * bằng JSON không bị lệch vì thứ tự bấm.
 */
export function LocationPicker({
  value,
  initial = NO_IDS,
  disabled = false,
  onChange,
  labelClassName,
  className,
}: {
  value: readonly UUID[]
  initial?: readonly UUID[]
  disabled?: boolean
  onChange: (ids: UUID[]) => void
  labelClassName: string
  /** Khoảng cách với phần trên đặt ở đây, để khi không vẽ gì thì không thừa ô trống. */
  className?: string
}) {
  const { locations, locationsAvailable } = useSchedule()
  const { t } = useI18n()
  const byId = useMemo(() => locationsById(locations), [locations])
  const options = useMemo(() => {
    const ids = new Set(activeLocations(locations).map((l) => l.id))
    for (const id of value) ids.add(id)
    for (const id of initial) ids.add(id)
    return sortLocationIds([...ids], byId)
  }, [locations, byId, value, initial])

  if (!locationsAvailable || options.length === 0) return null
  if (disabled && value.length === 0 && initial.length === 0) return null

  const selected = new Set(value)
  return (
    <div className={className}>
      <span className={labelClassName}>{t('common.locations')}</span>
      {disabled ? (
        <span data-tooltip={t('loc.lockedHint')} className="inline-flex">
          {value.length > 0 ? (
            <LocationChips ids={value} byId={byId} />
          ) : (
            <span className="text-xs text-slate-400">{t('loc.none')}</span>
          )}
        </span>
      ) : (
        <div role="group" aria-label={t('loc.pick')} className="flex flex-wrap gap-1.5">
          {options.map((id) => {
            const location = byId.get(id)
            const on = selected.has(id)
            const hidden = !!location && !location.is_active
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                data-tooltip={hidden ? t('loc.hidden') : undefined}
                onClick={() =>
                  onChange(
                    normalizeLocationIds(
                      on ? value.filter((x) => x !== id) : [...value, id],
                    ),
                  )
                }
                className={`inline-flex min-h-11 max-w-full items-center gap-1 rounded-full px-3 text-sm font-medium ring-1 ring-inset transition sm:min-h-0 sm:px-2 sm:py-0.5 sm:text-xs ${
                  on
                    ? locationTone(location)
                    : 'bg-white text-slate-500 ring-slate-300 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                {on ? (
                  <Check className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0 sm:h-3 sm:w-3" />
                )}
                <span className="truncate">{location?.name ?? t('loc.unknown')}</span>
                {hidden && <EyeOff className="h-3 w-3 shrink-0 opacity-70" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'

const lockedInputClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-base sm:text-sm text-slate-500 outline-none cursor-not-allowed'

const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

/**
 * Chế độ Đơn giản của form ca: chỉ xoay quanh phần của người đang đăng nhập —
 * nhận ca, chỉnh giờ/ghi chú của mình, điểm danh, rời ca. Thông tin ca và
 * người khác chỉ để xem; muốn sửa thì sang Nâng cao.
 *
 * Mỗi nút hành động lưu ngay và đóng form, nên nhân viên không phải nhớ bấm
 * Lưu. Riêng sửa giờ/ghi chú là sửa nháp, lưu bằng nút ở chân form — cùng
 * state với chế độ Nâng cao, đổi chế độ giữa chừng không mất gì.
 *
 * Luật chấm công lấy từ lib/attendance.ts: chỉ ẩn sẵn những gì database sẽ
 * từ chối, không thay nó.
 */
export function ShiftSimpleView({
  shift,
  rows,
  highlightAssignmentId,
  saving,
  onPatchRow,
  onJoin,
  onLeave,
  onCheckIn,
  onJoinDirtyChange,
}: {
  shift: ShiftWithAssignments
  rows: EditorRow[]
  highlightAssignmentId: UUID | null
  saving: boolean
  onPatchRow: (key: string, patch: Partial<EditorRow>) => void
  onJoin: (draft: JoinDraft) => void
  onLeave: (key: string) => void
  onCheckIn: (assignmentId: UUID) => void
  /**
   * Phần "nhận ca" đang điền dở (giờ / ghi chú / nơi trực khác mặc định) —
   * nằm ở state riêng của view này nên phải báo lên để form chặn đóng nhầm.
   */
  onJoinDirtyChange: (dirty: boolean) => void
}) {
  const { user } = useAuth()
  const { profilesById, locations, locationsAvailable, locationsLoaded } =
    useSchedule()
  const { t, dateLocale } = useI18n()
  const locationById = useMemo(() => locationsById(locations), [locations])
  const noActiveLocations = useMemo(
    () => activeLocations(locations).length === 0,
    [locations],
  )
  const shiftColor = useShiftColor()
  const restricted = uiRestricted(user)

  const shiftStart = normalizeTime(shift.start_time)
  const shiftEnd = normalizeTime(shift.end_time)

  const mine = user ? rows.find((r) => r.user_id === user.id) : undefined
  /** Bản đã lưu — điểm danh và khoá giờ dựa trên bản này, không phải bản nháp. */
  const saved = user
    ? shift.assignments.find((a) => a.user_id === user.id)
    : undefined
  const others = rows
    .filter((r) => r !== mine)
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))

  const [draft, setDraft] = useState<JoinDraft>({
    start_time: shiftStart,
    end_time: shiftEnd,
    note: null,
    location_ids: [],
  })
  const joinDirty =
    !mine &&
    (draft.start_time !== shiftStart ||
      draft.end_time !== shiftEnd ||
      !!draft.note?.trim() ||
      draft.location_ids.length > 0)
  useEffect(() => {
    onJoinDirtyChange(joinDirty)
    // Rời view (đổi sang Nâng cao) thì phần nháp này mất theo: hạ cờ.
    return () => onJoinDirtyChange(false)
  }, [joinDirty, onJoinDirtyChange])
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [confirmingEarly, setConfirmingEarly] = useState(false)

  // Nút điểm danh tự hiện khi tới giờ, như ở danh sách ca.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // ---- phần của mình ------------------------------------------------------
  const confirmed = saved?.status === 'confirmed'
  /** Đã điểm danh: nhân viên chỉ còn sửa được ghi chú. */
  const locked = restricted && confirmed && mine?.id === saved?.id
  /**
   * Tự rời ca chỉ trong 30 phút đầu kể từ lúc nhận (006). Dòng chưa lưu thì
   * rời thoải mái — trên máy chủ chưa có gì.
   */
  const leaveLate =
    restricted &&
    !!saved &&
    mine?.id === saved.id &&
    removeBlock(saved, user?.id ?? null, now) === 'late'
  const leaveUntil =
    restricted && saved && mine?.id === saved.id && !leaveLate
      ? format(leaveDeadline(saved), 'HH:mm')
      : null
  const start = mine?.start_time ?? draft.start_time
  const end = mine?.end_time ?? draft.end_time
  const rangeError = isInvalidRange(start, end)
  const outside =
    !rangeError &&
    (toMinutes(start) < toMinutes(shiftStart) ||
      toMinutes(end) > toMinutes(shiftEnd))
  const isWholeShift = start === shiftStart && end === shiftEnd
  const myLocationIds = mine ? (mine.location_ids ?? []) : draft.location_ids
  /**
   * Nơi trực của lượt đã điểm danh thì nhân viên không đổi được (012). Tính
   * trên bản đã lưu như các khoá khác; dòng chưa lưu thì không khoá.
   */
  const myLocationsLocked =
    restricted && !!saved && mine?.id === saved.id && locationsLocked(saved, user)
  /**
   * Tham gia ca sinh từ ca mẫu là nhận ca: phải có ít nhất một nơi trực (015),
   * admin cũng vậy. Chưa chạy 012 thì không bắt. Không còn nơi trực nào thì
   * ô chọn không hiện — nói rõ phải nhờ admin (hay danh sách tải lỗi, nếu
   * chưa tải được lần nào).
   */
  const joinLocationError =
    !mine &&
    shift.template_id != null &&
    locationsAvailable &&
    draft.location_ids.length === 0
      ? !noActiveLocations
        ? t('shift.errLocationRequired')
        : locationsLoaded
          ? t('claim.noLocations')
          : t('claim.locationsNotLoaded')
      : null

  function setMyLocations(location_ids: UUID[]) {
    if (mine) onPatchRow(mine.key, { location_ids })
    else setDraft((d) => ({ ...d, location_ids }))
  }

  function setTimes(patch: Partial<Pick<JoinDraft, 'start_time' | 'end_time'>>) {
    if (mine) onPatchRow(mine.key, patch)
    else setDraft((d) => ({ ...d, ...patch }))
  }

  const savedStart = saved ? normalizeTime(saved.start_time) : null
  const savedEnd = saved ? normalizeTime(saved.end_time) : null
  /**
   * Tới giờ điểm danh thì giờ của mình đứng yên (010, luật G) — vẫn điểm
   * danh, sửa ghi chú, rời ca được như thường.
   */
  const hoursStarted =
    restricted &&
    !confirmed &&
    !!savedStart &&
    mine?.id === saved?.id &&
    hoursLocked(shift.date, savedStart, now)
  const timesLocked = locked || hoursStarted
  const gate =
    saved && savedStart && savedEnd
      ? checkInWindow(shift.date, savedStart, savedEnd, now)
      : null
  const hoursDirty =
    !!mine && (mine.start_time !== savedStart || mine.end_time !== savedEnd)
  /** Điểm danh chỉ gửi trạng thái: phần giờ / nơi trực sửa dở phải lưu trước. */
  const draftDirty =
    hoursDirty ||
    (!!mine &&
      !!saved &&
      mine.id === saved.id &&
      !sameLocationIds(mine.location_ids ?? [], saved.location_ids ?? []))
  const canCheckIn =
    !!saved &&
    !confirmed &&
    mine?.id === saved.id &&
    (!restricted || gate === 'open')
  const started =
    !!savedStart &&
    addMinutes(fromDateKey(shift.date), toMinutes(savedStart)) <= now

  const color = shiftColor(shift)

  return (
    <div className="space-y-5">
      {/* ---- thông tin ca, chỉ xem ---- */}
      <section className="rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
          <h3 className="truncate font-medium text-slate-900">{shift.title}</h3>
        </div>
        <p className="mt-0.5 text-sm text-slate-600">
          <span className="capitalize">
            {format(fromDateKey(shift.date), 'EEEE, d/M/yyyy', {
              locale: dateLocale,
            })}
          </span>{' '}
          · <span className="tabular-nums">{formatRange(shiftStart, shiftEnd)}</span>
        </p>
        {shift.note && (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-slate-600 select-text">
            <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            {shift.note}
          </p>
        )}
      </section>

      {/* ---- phần của bạn ---- */}
      <section data-tour="simple-mine">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-slate-900">
            {t('shiftSimple.yourPart')}
          </h3>
          {saved && <StatusBadge status={saved.status} size="sm" />}
          {saved?.confirmed_at && (
            <span className="text-xs text-slate-400 tabular-nums">
              {t('list.checkedInAt', {
                time: format(new Date(saved.confirmed_at), 'HH:mm d/M'),
              })}
            </span>
          )}
        </div>

        <div
          className={`rounded-lg border bg-white p-3 ${
            mine && highlightAssignmentId === mine.id
              ? 'border-indigo-400 ring-2 ring-indigo-500/20'
              : 'border-slate-200'
          }`}
        >
          {!mine && (
            <p className="mb-3 text-sm text-slate-600">
              {t('shiftSimple.notOnShift')}
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
              <label className={labelClass} htmlFor="simple-start">
                {t('common.from')}
              </label>
              <input
                id="simple-start"
                type="time"
                className={timesLocked ? lockedInputClass : inputClass}
                value={start}
                disabled={timesLocked}
                onChange={(e) => setTimes({ start_time: e.target.value })}
              />
            </div>
            <div className="min-w-0 flex-1 sm:w-28 sm:flex-none">
              <label className={labelClass} htmlFor="simple-end">
                {t('common.to')}
              </label>
              <input
                id="simple-end"
                type="time"
                className={timesLocked ? lockedInputClass : inputClass}
                value={end}
                disabled={timesLocked}
                onChange={(e) => setTimes({ end_time: e.target.value })}
              />
            </div>
            {!timesLocked && !isWholeShift && (
              <button
                type="button"
                onClick={() =>
                  setTimes({ start_time: shiftStart, end_time: shiftEnd })
                }
                className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50 sm:min-h-0 sm:py-1.5"
              >
                {t('shiftSimple.wholeShift')}
              </button>
            )}
          </div>

          <LocationPicker
            className="mt-2"
            value={myLocationIds}
            initial={mine?.id === saved?.id ? saved?.location_ids : undefined}
            disabled={myLocationsLocked}
            onChange={setMyLocations}
            labelClassName={labelClass}
          />

          <div className="mt-2">
            <input
              className={inputClass}
              value={(mine ? mine.note : draft.note) ?? ''}
              placeholder={t('shiftSimple.notePlaceholder')}
              onChange={(e) =>
                mine
                  ? onPatchRow(mine.key, { note: e.target.value })
                  : setDraft((d) => ({ ...d, note: e.target.value }))
              }
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {rangeError ? (
              <span className="font-medium text-rose-600">
                {t('shift.errRowRange')}
              </span>
            ) : (
              <span className="text-slate-500">{formatDuration(start, end)}</span>
            )}
            {outside && (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {t('shift.warnOutside')}
              </span>
            )}
            {locked && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Lock className="h-3 w-3" />
                {t('shiftSimple.hoursLocked')}
              </span>
            )}
            {hoursStarted && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <Lock className="h-3 w-3" />
                {t('shift.hoursLockedStarted')}
              </span>
            )}
          </div>

          {/* ---- hành động chính ---- (đã khoá thì không còn gì để bấm) */}
          {!locked && (
            <div
              data-tour="simple-actions"
              className="mt-3 border-t border-slate-100 pt-3"
            >
              {!mine && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <button
                    type="button"
                    onClick={() => onJoin(draft)}
                    disabled={!user || rangeError || saving || !!joinLocationError}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2"
                  >
                    <Plus className="h-4 w-4" />
                    {saving ? t('shiftSimple.joining') : t('shiftSimple.join')}
                  </button>
                  {joinLocationError && (
                    <span
                      role="alert"
                      className="inline-flex items-start gap-1 text-xs font-medium text-rose-600"
                    >
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      {joinLocationError}
                    </span>
                  )}
                </div>
              )}

              {mine && confirmingLeave && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm text-slate-700">
                    {t('shiftSimple.leaveConfirm')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingLeave(false)}
                    disabled={saving}
                    className="min-h-11 rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onLeave(mine.key)}
                    disabled={saving}
                    className="min-h-11 rounded-md bg-rose-600 px-3 text-sm font-medium text-white shadow-xs transition hover:bg-rose-500 disabled:opacity-60 sm:min-h-0 sm:py-1.5"
                  >
                    {saving ? t('common.saving') : t('shiftSimple.leave')}
                  </button>
                </div>
              )}

              {mine && !confirmingLeave && confirmingEarly && saved && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto text-sm text-slate-700">
                    {t('list.confirmEarly.body')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmingEarly(false)}
                    disabled={saving}
                    className="min-h-11 rounded-md px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 sm:min-h-0 sm:py-1.5"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCheckIn(saved.id)}
                    disabled={saving}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-60 sm:min-h-0 sm:py-1.5"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? t('common.saving') : t('shiftSimple.checkIn')}
                  </button>
                </div>
              )}

              {mine && !confirmingLeave && !confirmingEarly && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {canCheckIn && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!saved) return
                        if (started) onCheckIn(saved.id)
                        else setConfirmingEarly(true)
                      }}
                      disabled={draftDirty || saving}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:w-auto sm:py-2"
                    >
                      <Check className="h-4 w-4" />
                      {t('shiftSimple.checkIn')}
                    </button>
                  )}

                  <span className="text-xs text-slate-500">
                    {canCheckIn && draftDirty
                      ? t('shiftSimple.saveBeforeCheckIn')
                      : saved && !confirmed && restricted && gate === 'early'
                        ? t('list.checkInOpens', {
                            time: format(
                              checkInOpensAt(shift.date, savedStart!),
                              'HH:mm d/M',
                            ),
                          })
                        : saved && !confirmed && restricted && gate === 'closed'
                          ? t('list.checkInClosed')
                          : canCheckIn && restricted
                            ? t('shiftSimple.checkInWindow', {
                                from: format(
                                  checkInOpensAt(shift.date, savedStart!),
                                  'HH:mm',
                                ),
                                to: savedEnd!,
                              })
                            : null}
                  </span>

                  {leaveLate ? (
                    <span className="ml-auto inline-flex items-start gap-1 text-xs text-slate-500">
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                      {t('shift.rowLockedLate')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingLeave(true)}
                      disabled={saving}
                      className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 sm:min-h-0 sm:py-1.5"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('shiftSimple.leave')}
                      {leaveUntil && (
                        <span className="font-normal text-rose-500/80">
                          · {t('shiftSimple.leaveUntil', { time: leaveUntil })}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---- người khác, chỉ xem ---- */}
      <section data-tour="simple-others">
        <h3 className="mb-2 text-sm font-medium text-slate-900">
          {t('shiftSimple.others')}{' '}
          <span className="font-normal text-slate-400">({others.length})</span>
        </h3>
        {others.length === 0 ? (
          <p className="text-sm text-slate-500">{t('shiftSimple.noOthers')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {others.map((row) => {
              const profile = profilesById.get(row.user_id)
              return (
                <li
                  key={row.key}
                  className={`flex items-center gap-3 px-3 py-2 ${
                    row.id && row.id === highlightAssignmentId
                      ? 'bg-indigo-50/60'
                      : ''
                  }`}
                >
                  <Avatar
                    name={profile?.display_name ?? '?'}
                    seed={row.user_id}
                    size="sm"
                  />
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                      {profile?.display_name ?? t('common.unknownStaff')}
                    </span>
                    <LocationChips
                      ids={row.location_ids ?? []}
                      byId={locationById}
                      size="xs"
                    />
                  </span>
                  <span className="shrink-0 text-sm text-slate-600 tabular-nums">
                    {formatRange(row.start_time, row.end_time)}
                  </span>
                  <StatusBadge status={row.status} size="sm" />
                </li>
              )
            })}
          </ul>
        )}
        {/* Nhân viên trong ca có người khác thì Nâng cao cũng chỉ cho xem —
            đừng gợi ý sang đó sửa. */}
        {!(restricted && others.length > 0) && (
          <p className="mt-3 text-xs text-slate-500">
            {t('shiftSimple.advancedHint')}
          </p>
        )}
      </section>
    </div>
  )
}
