import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { ShiftList } from '../components/ShiftList'
import { PageSkeleton } from '../components/PageSkeleton'

export function PendingPage() {
  const { user } = useAuth()
  const { shifts, loading } = useSchedule()
  const { t } = useI18n()
  // Opens filtered to your own assignments, matching what the nav badge
  // counts. Untick to see the whole team's.
  const [onlyMine, setOnlyMine] = useState(true)

  const matches = useMemo(() => {
    const keep = (userId: string) => !onlyMine || userId === user?.id
    return shifts.filter((shift) =>
      shift.assignments.some((a) => a.status === 'pending' && keep(a.user_id)),
    )
  }, [shifts, onlyMine, user?.id])

  const pendingCount = matches.reduce(
    (n, s) =>
      n +
      s.assignments.filter(
        (a) => a.status === 'pending' && (!onlyMine || a.user_id === user?.id),
      ).length,
    0,
  )

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {t('pending.title')}
          </h1>
          <p className="text-sm text-slate-500">
            {t('pending.subtitle', { count: pendingCount })}
          </p>
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          {t('timeline.onlyMine')}
        </label>
      </div>

      <ShiftList
        shifts={matches}
        highlightUserId={user?.id ?? null}
        assignmentFilter={(a) =>
          a.status === 'pending' && (!onlyMine || a.user_id === user?.id)
        }
        emptyTitle={t('pending.empty')}
        emptyHint={t('pending.emptyHint')}
      />
    </div>
  )
}
