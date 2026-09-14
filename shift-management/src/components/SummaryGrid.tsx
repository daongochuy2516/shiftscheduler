import { format, isSameDay } from 'date-fns'
import { CalendarOff } from 'lucide-react'
import type { UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { shiftColor } from '../lib/colors'
import { formatMinutesDuration, formatRange, toDateKey } from '../lib/time'
import type { SummaryRow } from '../lib/summary'
import { Avatar } from './Avatar'

const LEFT_COL = 176
const TOTAL_COL = 88
const DAY_MIN = 132
const DAY_DENSE = 56

/**
 * Bảng tổng kết: nhân viên theo hàng × ngày theo cột, đọc như bảng công.
 *
 * Chỉ để xem — bấm vào một ca không mở form sửa. Tổng kết là ảnh chụp việc
 * đã trực xong, muốn sửa thì đi qua trang Lịch.
 */
export function SummaryGrid({
  days,
  rows,
  minutesByDate,
  totalMinutes,
  profileCount,
  currentUserId,
  dense,
}: {
  days: Date[]
  rows: SummaryRow[]
  minutesByDate: Map<string, number>
  totalMinutes: number
  profileCount: number
  currentUserId: UUID | null
  /** Tháng có tới 31 cột nên mỗi ô chỉ ghi số giờ, không ghi từng ca. */
  dense: boolean
}) {
  const { t, dateLocale } = useI18n()
  const today = toDateKey(new Date())
  const dayWidth = dense ? DAY_DENSE : DAY_MIN
  const gridTemplate = `${LEFT_COL}px repeat(${days.length}, minmax(${dayWidth}px, 1fr)) ${TOTAL_COL}px`
  const minWidth = LEFT_COL + days.length * dayWidth + TOTAL_COL

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <div className="thin-scrollbar overflow-x-auto">
        <div style={{ minWidth }}>
          {/* ---- day header ---- */}
          <div
            className="grid border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
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
                    className={`block text-sm font-semibold ${
                      isToday ? 'text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {format(day, dense ? 'd' : 'd MMM', { locale: dateLocale })}
                  </span>
                </div>
              )
            })}
            <div className="px-2 py-2 text-right text-xs font-semibold tracking-wide text-slate-500 uppercase">
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
                />
              ))}

              {/* ---- tổng theo từng ngày ---- */}
              <div
                className="grid border-t border-slate-200 bg-slate-50"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="sticky left-0 z-20 border-r border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
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
                <div className="px-2 py-2 text-right text-xs font-semibold tabular-nums text-slate-900">
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
}: {
  row: SummaryRow
  days: Date[]
  dense: boolean
  gridTemplate: string
  isMe: boolean
  youLabel: string
}) {
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
            <p className="text-[10px] font-medium text-indigo-600">{youLabel}</p>
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
                title={entries
                  .map((e) => `${e.title} · ${formatRange(e.start, e.end)}`)
                  .join('\n')}
                className={`text-xs font-medium tabular-nums ${
                  minutes > 0 ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {minutes > 0 ? formatMinutesDuration(minutes) : '·'}
              </span>
            ) : (
              entries.map((entry) => {
                const color = shiftColor(entry.shiftId)
                return (
                  <div
                    key={entry.assignmentId}
                    title={`${entry.title} · ${formatRange(entry.start, entry.end)}`}
                    className={`rounded border px-1.5 py-1 ${color.block}`}
                  >
                    <span className="block truncate text-[11px] font-semibold">
                      {entry.title}
                    </span>
                    <span className="block truncate text-[10px] opacity-75">
                      {entry.start}–{entry.end}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end px-2 py-2 text-xs font-semibold tabular-nums text-slate-700">
        {row.minutes > 0 ? formatMinutesDuration(row.minutes) : '—'}
      </div>
    </div>
  )
}
