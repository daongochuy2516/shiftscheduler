import { useMemo, useState } from 'react'
import { Check, Layers, Plus, Settings2 } from 'lucide-react'
import type { ShiftTemplate, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { useAuth } from '../auth/AuthContext'
import { useSchedule, useShifts } from '../data/ScheduleContext'
import { templateColor } from '../lib/colors'
import { formatRange, toDateKey } from '../lib/time'
import { canManageTemplates } from '../lib/attendance'
import { ClaimTemplateModal } from './ClaimTemplateModal'
import { TemplateManagerModal } from './TemplateManagerModal'

/**
 * The quick-claim strip above the day timeline: every recurring template that
 * repeats on the visible day. Claiming opens a date picker rather than
 * assuming the visible day, so staff can book ahead in one go.
 */
export function TemplateBar({ date }: { date: Date }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { templates, templatesAvailable } = useSchedule()
  const [managing, setManaging] = useState(false)
  // Nhân viên chỉ nhận ca mẫu; tạo / sửa / xoá là việc của admin (008).
  const canManage = canManageTemplates(user)
  const [claimTarget, setClaimTarget] = useState<ShiftTemplate | null>(null)

  const dateKey = toDateKey(date)
  const weekday = date.getDay()
  // Cùng khoá với lát cắt ngày của trang Lịch, nên không tải thêm lần nào.
  const { shifts } = useShifts({ kind: 'range', from: dateKey, to: dateKey })

  /** Active templates that repeat on this weekday (empty list = every day). */
  const todays = useMemo(
    () =>
      templates.filter(
        (tpl) =>
          tpl.is_active &&
          (tpl.weekdays.length === 0 || tpl.weekdays.includes(weekday)),
      ),
    [templates, weekday],
  )

  /** Templates the signed-in user has already claimed on the visible day. */
  const claimedToday = useMemo(() => {
    const ids = new Set<UUID>()
    for (const shift of shifts) {
      if (shift.date !== dateKey || !shift.template_id) continue
      if (shift.assignments.some((a) => a.user_id === user?.id)) {
        ids.add(shift.template_id)
      }
    }
    return ids
  }, [shifts, dateKey, user?.id])

  if (!templatesAvailable) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
        <p className="font-medium text-amber-900">{t('tpl.notInstalled')}</p>
        <p className="mt-0.5 text-amber-800">{t('tpl.notInstalledHint')}</p>
      </div>
    )
  }

  return (
    <>
      <section className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Layers className="h-4 w-4 text-slate-400" />
            {t('tpl.section')}
          </h2>
          <p className="hidden text-xs text-slate-500 sm:block">
            {t('tpl.sectionHint')}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => setManaging(true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {t('tpl.manage')}
            </button>
          )}
        </div>

        {templates.length === 0 && !canManage ? (
          <p className="px-1 py-2 text-sm text-slate-500">
            {t('tpl.emptyStaff')}
          </p>
        ) : templates.length === 0 ? (
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {t('tpl.empty')} {t('tpl.emptyHint')}
          </button>
        ) : todays.length === 0 ? (
          <p className="px-1 py-2 text-sm text-slate-500">
            {t('tpl.noneToday')}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {todays.map((tpl) => {
              const color = templateColor(tpl)
              const isClaimed = claimedToday.has(tpl.id)
              return (
                <li key={tpl.id}>
                  <div
                    className={`flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 ${color.block}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${color.dot}`} />
                    <span className="text-sm font-medium">{tpl.title}</span>
                    <span className="text-xs opacity-75">
                      {formatRange(tpl.start_time, tpl.end_time)}
                    </span>

                    {/* Status of the visible day — the button stays usable
                        so you can still book other days. */}
                    {isClaimed && (
                      <span
                        title={t('tpl.claimedTitle')}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      >
                        <Check className="h-2.5 w-2.5" />
                        {t('tpl.claimed')}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setClaimTarget(tpl)}
                      disabled={!user}
                      title={t('tpl.claimTitle', { title: tpl.title })}
                      className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:opacity-60"
                    >
                      <Plus className="h-3 w-3" />
                      {t('tpl.claim')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {claimTarget && (
        <ClaimTemplateModal
          template={claimTarget}
          viewedDate={date}
          onClose={() => setClaimTarget(null)}
        />
      )}

      {managing && canManage && (
        <TemplateManagerModal onClose={() => setManaging(false)} />
      )}
    </>
  )
}
