import { useMemo } from 'react'
import { format, isSameDay } from 'date-fns'
import { CalendarOff } from 'lucide-react'
import type { Location, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useSchedule } from '../data/ScheduleContext'
import { useShiftColor } from '../data/useShiftColor'
import { formatMinutesDuration, formatRange, toDateKey } from '../lib/time'
import { locationsById, sortLocationIds } from '../lib/locations'
import type { RecordedEntry, SummaryRow } from '../lib/summary'
import { Avatar } from './Avatar'

const LEFT_COL = 176
const TOTAL_COL = 88
const DAY_MIN = 132
const DAY_DENSE = 56

/**
 * Bảng tổng kết: nhân viên theo hàng × ngày theo cột, đọc như bảng công.
 *
 * Bấm một khối ca mở form sửa như trang Lịch (`onSelectEntry`). Chế độ
 * Tháng mỗi ô chỉ là tổng giờ của nhiều ca nên không bấm được.
 */
export function SummaryGrid({
  days,
  rows,
  minutesByDate,
  totalMinutes,
  profileCount,
  currentUserId,
  dense,
  onSelectEntry,
}: {
  days: Date[]
  rows: SummaryRow[]
  minutesByDate: Map<string, number>
  totalMinutes: number
  profileCount: number
  currentUserId: UUID | null
  /** Tháng có tới 31 cột nên mỗi ô chỉ ghi số giờ, không ghi từng ca. */
  dense: boolean
  /** Bấm một khối ca; không truyền thì chỉ để xem. */
  onSelectEntry?: (shiftId: UUID, assignmentId: UUID) => void
}) {
  const { t, dateLocale } = useI18n()
  const { locations } = useSchedule()
  const locationById = useMemo(() => locationsById(locations), [locations])
  const today = toDateKey(new Date())
  const dayWidth = dense ? DAY_DENSE : DAY_MIN
  const gridTemplate = `${LEFT_COL}px repeat(${days.length}, minmax(${dayWidth}px, 1fr)) ${TOTAL_COL}px`
  const minWidth = LEFT_COL + days.length * dayWidth + TOTAL_COL

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {/* ---- day header ---- */}
          <div
            className="grid border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
              {t('common.staff')}
            </div>
            {days.map((day) => {
              const isToday = toDateKey(day) === today
              return (
                <div
                  key={day.toISOString()}
                  className={`border-r border-slate-200 px-2 py-2 last:border-r-0 ${
                    dense ? 'text-center' : 'text-left'
                  } ${isToday ? 'bg-indigo-50' : ''}`}
                >
                  <span
                    className={`block text-xs font-medium capitalize ${
                      isToday ? 'text-indigo-600' : 'text-slate-500'
                    }`}
                  >
                    {format(day, dense ? 'EEEEE' : 'EEE', {
                      locale: dateLocale,
                    })}
                  </span>
                  <span
                    className={`block text-sm font-medium ${
                      isToday ? 'text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {format(day, dense ? 'd' : 'd MMM', { locale: dateLocale })}
                  </span>
                </div>
              )
            })}
            <div className="px-2 py-2 text-right text-xs font-medium text-slate-500">
              {t('timeline.weekTotal')}
            </div>
          </div>

          {/* ---- staff rows ---- */}
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <CalendarOff className="h-6 w-6 text-slate-300" />
              {profileCount === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-600">
                    {t('timeline.noStaffAccounts')}
                  </p>
                  <p className="max-w-sm text-sm text-slate-500">
                    {t('timeline.noStaffAccountsHint')}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-600">
                    {t('summary.empty')}
                  </p>
                  <p className="max-w-sm text-sm text-slate-500">
                    {t('summary.emptyHint')}
                  </p>
                </>
              )}
            </div>
          ) : (
            <>
              {rows.map((row) => (
                <StaffRow
                  key={row.profile.id}
                  row={row}
                  days={days}
                  dense={dense}
                  gridTemplate={gridTemplate}
                  isMe={row.profile.id === currentUserId}
                  youLabel={t('common.you')}
                  locationById={locationById}
                  onSelectEntry={onSelectEntry}
                />
              ))}

              {/* ---- tổng theo từng ngày ---- */}
              <div
                className="grid border-t border-slate-200 bg-slate-50"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                  {t('summary.dayTotal')}
                </div>
                {days.map((day) => {
                  const minutes = minutesByDate.get(toDateKey(day)) ?? 0
                  return (
                    <div
                      key={toDateKey(day)}
                      className={`border-r border-slate-200 px-2 py-2 text-xs font-medium tabular-nums last:border-r-0 ${
                        dense ? 'text-center' : 'text-left'
                      } ${minutes > 0 ? 'text-slate-700' : 'text-slate-300'}`}
                    >
                      {minutes > 0 ? formatMinutesDuration(minutes) : '—'}
                    </div>
                  )
                })}
                <div className="px-2 py-2 text-right text-xs font-medium tabular-nums text-slate-900">
                  {totalMinutes > 0 ? formatMinutesDuration(totalMinutes) : '—'}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StaffRow({
  row,
  days,
  dense,
  gridTemplate,
  isMe,
  youLabel,
  locationById,
  onSelectEntry,
}: {
  row: SummaryRow
  days: Date[]
  dense: boolean
  gridTemplate: string
  isMe: boolean
  youLabel: string
  locationById: ReadonlyMap<UUID, Location>
  onSelectEntry?: (shiftId: UUID, assignmentId: UUID) => void
}) {
  const shiftColor = useShiftColor()
  const { t } = useI18n()

  /** "Ca · 08:00–13:00 · Fanpage, Discord" — nơi trực chỉ nằm trong tooltip. */
  function entryTooltip(e: RecordedEntry): string {
    const where = sortLocationIds(e.locationIds, locationById)
      .map((id) => locationById.get(id)?.name ?? t('loc.unknown'))
      .join(', ')
    return `${e.title} · ${formatRange(e.start, e.end)}${where ? ` · ${where}` : ''}`
  }
  return (
    <div
      className={`grid border-b border-slate-100 last:border-b-0 ${
        isMe ? 'bg-indigo-50/40' : ''
      }`}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <div
        className={`sticky left-0 z-20 flex items-center gap-2 border-r border-slate-200 px-3 py-2 ${
          isMe ? 'bg-indigo-50' : 'bg-white'
        }`}
      >
        <Avatar
          name={row.profile.display_name}
          seed={row.profile.id}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {row.profile.display_name}
          </p>
          {isMe && (
            <p className="text-[11px] font-medium text-indigo-600">{youLabel}</p>
          )}
        </div>
      </div>

      {days.map((day) => {
        const key = toDateKey(day)
        const entries = row.byDate.get(key) ?? []
        const minutes = entries.reduce((sum, e) => sum + e.minutes, 0)
        const isToday = isSameDay(day, new Date())
        return (
          <div
            key={key}
            className={`border-r border-slate-100 last:border-r-0 ${
              dense
                ? 'flex items-center justify-center px-1 py-2'
                : 'space-y-1 p-1.5'
            } ${isToday ? 'bg-indigo-50/30' : ''}`}
          >
            {dense ? (
              <span
                data-tooltip={entries.map(entryTooltip).join('\n')}
                className={`text-xs font-medium tabular-nums ${
                  minutes > 0 ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {minutes > 0 ? formatMinutesDuration(minutes) : '·'}
              </span>
            ) : (
              entries.map((entry) => {
                const color = shiftColor({
                  id: entry.shiftId,
                  template_id: entry.templateId,
                })
                const body = (
                  <>
                    <span className="block truncate text-[11px] font-medium">
                      {entry.title}
                    </span>
                    <span className="block truncate text-[11px] opacity-75">
                      {entry.start}–{entry.end}
                    </span>
                  </>
                )
                return onSelectEntry ? (
                  <button
                    key={entry.assignmentId}
                    type="button"
                    onClick={() => onSelectEntry(entry.shiftId, entry.assignmentId)}
                    data-tooltip={entryTooltip(entry)}
                    className={`block w-full rounded border px-1.5 py-1 text-left transition focus:ring-2 focus:ring-indigo-500 focus:outline-none ${color.block}`}
                  >
                    {body}
                  </button>
                ) : (
                  <div
                    key={entry.assignmentId}
                    data-tooltip={entryTooltip(entry)}
                    className={`rounded border px-1.5 py-1 ${color.block}`}
                  >
                    {body}
                  </div>
                )
              })
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end px-2 py-2 text-xs font-medium tabular-nums text-slate-700">
        {row.minutes > 0 ? formatMinutesDuration(row.minutes) : '—'}
      </div>
    </div>
  )
}
