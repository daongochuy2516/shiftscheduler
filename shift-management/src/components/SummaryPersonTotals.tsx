import { CalendarOff } from 'lucide-react'
import type { UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { formatMinutesDuration } from '../lib/time'
import type { SummaryRow } from '../lib/summary'
import { Avatar } from './Avatar'

/**
 * Tổng giờ theo từng người, đặt dưới lịch tuần của trang Tổng kết (desktop).
 *
 * Lịch dạng cột cho thấy *khi nào* ai trực nhưng không còn cột "Tổng" theo
 * người như bảng công cũ, nên con số đó được tách ra đây. Thứ tự giữ nguyên
 * `rows` (bạn trước, rồi theo tên) và ô tích "Hiện cả nhân viên không có ca"
 * vẫn quyết định người 0 giờ có hiện hay không — cả hai đã xử lý ở
 * `buildSummary`.
 */
export function SummaryPersonTotals({
  title,
  rows,
  totalCount,
  totalMinutes,
  profileCount,
  currentUserId,
}: {
  title: string
  rows: SummaryRow[]
  totalCount: number
  totalMinutes: number
  profileCount: number
  currentUserId: UUID | null
}) {
  const { t } = useI18n()

  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
      <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </h2>

      {rows.length === 0 ? (
        // Lịch phía trên đã báo "chưa ghi nhận được ca nào"; ở đây chỉ nói vì
        // sao, hoặc báo chưa có tài khoản nào.
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
          <CalendarOff className="h-4 w-4 shrink-0 text-slate-300" />
          {profileCount === 0 ? (
            <span>
              <span className="font-medium text-slate-600">
                {t('timeline.noStaffAccounts')}
              </span>{' '}
              {t('timeline.noStaffAccountsHint')}
            </span>
          ) : (
            <span>{t('summary.emptyHint')}</span>
          )}
        </div>
      ) : (
        <>
          {/* Nhiều cột cho gọn trên màn rộng; đọc trái → phải theo thứ tự rows. */}
          <ul className="grid gap-x-6 px-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => {
              const isMe = row.profile.id === currentUserId
              return (
                <li
                  key={row.profile.id}
                  className="flex min-w-0 items-center gap-2 border-b border-slate-100 py-2"
                >
                  <Avatar
                    name={row.profile.display_name}
                    seed={row.profile.id}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {row.profile.display_name}
                    </span>
                    {isMe && (
                      <span className="block text-[10px] font-medium text-indigo-600">
                        {t('common.you')}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                    {row.count > 0
                      ? t('timeline.assignmentCount', { count: row.count })
                      : ''}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${
                      row.minutes > 0 ? 'text-slate-800' : 'text-slate-300'
                    }`}
                  >
                    {row.minutes > 0 ? formatMinutesDuration(row.minutes) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2">
            <span className="flex-1 text-xs font-semibold text-slate-600">
              {t('timeline.weekTotal')}
            </span>
            <span className="shrink-0 text-xs text-slate-500 tabular-nums">
              {t('timeline.assignmentCount', { count: totalCount })}
            </span>
            <span className="w-16 shrink-0 text-right text-sm font-semibold text-slate-900 tabular-nums">
              {totalMinutes > 0 ? formatMinutesDuration(totalMinutes) : '—'}
            </span>
          </div>
        </>
      )}
    </section>
  )
}
