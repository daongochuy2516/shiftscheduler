import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useSchedule } from '../data/ScheduleContext'
import { ShiftList } from '../components/ShiftList'
import { PageSkeleton } from '../components/PageSkeleton'
import { toDateKey } from '../lib/time'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

type Window = 'upcoming' | 'past' | 'all'

const WINDOWS: { id: Window; label: TranslationKey }[] = [
  { id: 'upcoming', label: 'list.window.upcoming' },
  { id: 'past', label: 'list.window.past' },
  { id: 'all', label: 'list.window.all' },
]

export function AllShiftsPage() {
  const { shifts, profilesById, loading } = useSchedule()
  const { user } = useAuth()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [window, setWindow] = useState<Window>('upcoming')

  const today = toDateKey(new Date())

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shifts.filter((shift) => {
      if (window === 'upcoming' && shift.date < today) return false
      if (window === 'past' && shift.date >= today) return false
      if (!q) return true
      if (shift.title.toLowerCase().includes(q)) return true
      if (shift.note?.toLowerCase().includes(q)) return true
      return shift.assignments.some((a) =>
        profilesById
          .get(a.user_id)
          ?.display_name.toLowerCase()
          .includes(q),
      )
    })
  }, [shifts, query, window, today, profilesById])

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {t('allShifts.title')}
          </h1>
          <p className="text-sm text-slate-500">
            {t('allShifts.shown', { count: filtered.length })}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('list.searchPlaceholder')}
              className="w-60 rounded-md border border-slate-300 bg-white py-1.5 pr-3 pl-8 text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWindow(w.id)}
                className={`rounded px-2.5 py-1 text-sm font-medium transition ${
                  window === w.id
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(w.label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ShiftList
        shifts={filtered}
        highlightUserId={user?.id ?? null}
        emptyTitle={t('allShifts.empty')}
        emptyHint={t('allShifts.emptyHint')}
      />
    </div>
  )
}
