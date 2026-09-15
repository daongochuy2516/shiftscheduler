import { useMemo } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useSchedule, useShifts } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { ShiftList } from '../components/ShiftList'
import { PageSkeleton } from '../components/PageSkeleton'
import { formatMinutesDuration, toDateKey, toMinutes } from '../lib/time'

export function MyShiftsPage() {
  const { user } = useAuth()
  const { loading } = useSchedule()
  const { t } = useI18n()
  const today = toDateKey(new Date())

  /**
   * Chỉ ca có mình, lọc ngay ở database. Vẫn là toàn bộ lịch sử của một
   * người — cần cho ô "Lượt phân công" — nhưng không còn kéo cả nhóm về.
   */
  const mineState = useShifts(user ? { kind: 'user', userId: user.id } : null)
  const mine = mineState.shifts

  const stats = useMemo(() => {
    const own = mine.flatMap((s) =>
      s.assignments
        .filter((a) => a.user_id === user?.id)
        .map((a) => ({ ...a, date: s.date })),
    )
    const upcoming = own.filter((a) => a.date >= today)
    const minutes = upcoming.reduce(
      (sum, a) => sum + (toMinutes(a.end_time) - toMinutes(a.start_time)),
      0,
    )
    return {
      total: own.length,
      upcoming: upcoming.length,
      pending: own.filter((a) => a.status === 'pending').length,
      upcomingHours: formatMinutesDuration(minutes),
    }
  }, [mine, user?.id, today])

  if (loading || !mineState.loaded) return <PageSkeleton />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {t('myShifts.title')}
        </h1>
        <p className="text-sm text-slate-500">
          {t('myShifts.subtitle', { name: user?.display_name ?? '' })}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t('myShifts.stat.assignments')}
          value={String(stats.total)}
        />
        <Stat label={t('myShifts.stat.upcoming')} value={String(stats.upcoming)} />
        <Stat label={t('myShifts.stat.pending')} value={String(stats.pending)} />
        <Stat label={t('myShifts.stat.hours')} value={stats.upcomingHours} />
      </dl>

      <ShiftList
        shifts={mine}
        highlightUserId={user?.id ?? null}
        assignmentFilter={(a) => a.user_id === user?.id}
        emptyTitle={t('myShifts.empty')}
        emptyHint={t('myShifts.emptyHint')}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-900/5">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold text-slate-900 tabular-nums">
        {value}
      </dd>
    </div>
  )
}
