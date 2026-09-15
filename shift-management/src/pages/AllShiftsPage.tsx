import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { useSchedule, useShiftChunks } from '../data/ScheduleContext'
import { ShiftList } from '../components/ShiftList'
import { GridSkeleton, PageSkeleton } from '../components/PageSkeleton'
import { ShiftSearchBar } from '../components/ShiftSearchBar'
import { DEFAULT_SHIFT_FILTERS, type ShiftFilters } from '../lib/shiftFilters'
import { planMonthChunks } from '../lib/shiftChunks'
import { fromDateKey, toDateKey } from '../lib/time'
import type { ShiftDateBounds, ShiftQuery, UUID } from '../types'
import { useAuth } from '../auth/AuthContext'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

type Window = 'upcoming' | 'past' | 'all'

const WINDOWS: { id: Window; label: TranslationKey }[] = [
  { id: 'upcoming', label: 'list.window.upcoming' },
  { id: 'past', label: 'list.window.past' },
  { id: 'all', label: 'list.window.all' },
]

/** Lấy ngày muộn hơn / sớm hơn, coi `null` là không giới hạn. */
function laterOf(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a > b ? a : b
}
function earlierOf(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return a < b ? a : b
}

export function AllShiftsPage() {
  const { profiles, profilesById, loading, shiftDateBounds, dataVersion } =
    useSchedule()
  const { user } = useAuth()
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [window, setWindow] = useState<Window>('upcoming')
  const [filters, setFilters] = useState<ShiftFilters>(DEFAULT_SHIFT_FILTERS)
  /** Số lát tháng đã tải theo chiều sắp xếp; cuộn tới đáy thì tăng. */
  const [chunkCount, setChunkCount] = useState(1)

  const today = toDateKey(new Date())
  const yesterday = toDateKey(addDays(fromDateKey(today), -1))

  /** Khoảng của tab — thứ nhân viên dùng hằng ngày, bộ lọc chỉ thu hẹp thêm. */
  const windowRange =
    window === 'upcoming'
      ? { from: today, to: null }
      : window === 'past'
        ? { from: null, to: yesterday }
        : { from: null, to: null }
  const from = laterOf(windowRange.from, filters.from)
  const to = earlierOf(windowRange.to, filters.to)

  // Đổi tab / khoảng / người / chiều thì bắt đầu lại từ lát đầu tiên. Đã cuộn
  // sâu 12 tháng rồi đổi tab thì không nên bắn 12 yêu cầu cùng lúc.
  function changeWindow(next: Window) {
    setWindow(next)
    setChunkCount(1)
  }
  function patch(next: Partial<ShiftFilters>) {
    setFilters((f) => ({ ...f, ...next }))
    setChunkCount(1)
  }
  /** Xoá hết trong thanh tìm kiếm: chữ và bộ lọc. Tab giữ nguyên. */
  function clearSearch() {
    setQuery('')
    setFilters(DEFAULT_SHIFT_FILTERS)
    setChunkCount(1)
  }

  // ---- điểm dừng ----------------------------------------------------------
  // Ngày ca sớm nhất / muộn nhất (của người đang lọc). Hỏi lại mỗi khi dữ liệu
  // đổi, để ca mới tạo ngoài mốc cũ vẫn hiện ra.
  const [bounds, setBounds] = useState<{
    staffId: UUID | null
    value: ShiftDateBounds
    error: string | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const staffId = filters.staffId
    shiftDateBounds(staffId).then(
      (value) => {
        if (!cancelled) setBounds({ staffId, value, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        setBounds({
          staffId,
          value: { earliest: null, latest: null },
          error: err instanceof Error ? err.message : String(err),
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [filters.staffId, dataVersion, shiftDateBounds])

  // Mốc của người khác thì chưa dùng được; còn mốc cũ của cùng người thì cứ
  // dùng trong lúc hỏi lại, để Realtime không làm danh sách nháy.
  const readyBounds =
    bounds !== null && bounds.staffId === filters.staffId ? bounds : null

  const plan = useMemo(
    () =>
      readyBounds
        ? planMonthChunks({
            from,
            to,
            earliest: readyBounds.value.earliest,
            latest: readyBounds.value.latest,
            order: filters.order,
            count: chunkCount,
          })
        : { chunks: [], hasMore: false },
    [readyBounds, from, to, filters.order, chunkCount],
  )

  const queries = useMemo<ShiftQuery[]>(
    () =>
      plan.chunks.map((c) => ({
        kind: 'range',
        from: c.from,
        to: c.to,
        userId: filters.staffId,
      })),
    [plan, filters.staffId],
  )

  const loaded = useShiftChunks(queries)
  const { shifts } = loaded

  // Tìm kiếm lọc ngay trên phần đã tải; lọc theo người đã làm ở database.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return shifts
    return shifts.filter((shift) => {
      if (shift.title.toLowerCase().includes(q)) return true
      if (shift.note?.toLowerCase().includes(q)) return true
      return shift.assignments.some((a) =>
        profilesById.get(a.user_id)?.display_name.toLowerCase().includes(q),
      )
    })
  }, [shifts, query, profilesById])

  // ---- cuộn vô hạn -------------------------------------------------------
  // Phần tử canh gác ở cuối danh sách, còn cách đáy 600px là tải lát kế tiếp.
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const canLoadMore = plan.hasMore && loaded.loaded && !loaded.loading

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !canLoadMore) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        // Ngắt ngay để một lần chạm đáy chỉ tải đúng một lát.
        observer.disconnect()
        setChunkCount((n) => n + 1)
      },
      { rootMargin: '0px 0px 600px 0px' },
    )
    // Observer mới báo trạng thái hiện tại ngay khi observe: lát vừa tải ít
    // ca, đáy vẫn trong tầm nhìn, thì lát sau tự tải tiếp mà không cần cuộn.
    observer.observe(el)
    return () => observer.disconnect()
  }, [canLoadMore, chunkCount])

  /**
   * Khung xương khi chưa có gì để hiện. Chưa khớp ca nào nhưng vẫn còn lát
   * chưa tải thì là "đang tìm", chưa phải "không có" — cuộn vô hạn tự tải
   * tiếp cho tới hết khoảng.
   */
  const showSkeleton =
    readyBounds === null ||
    (!loaded.loaded && shifts.length === 0) ||
    (filtered.length === 0 && plan.hasMore)
  const reachedEnd =
    chunkCount > 1 && !plan.hasMore && loaded.loaded && filtered.length > 0
  const error = loaded.error ?? readyBounds?.error ?? null

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

        <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <ShiftSearchBar
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={patch}
            onClear={clearSearch}
            profiles={profiles}
            dateLimits={{
              // Theo tab: Sắp tới không chọn được ngày đã qua, và ngược lại.
              from: { min: windowRange.from, max: to },
              to: { min: from, max: windowRange.to },
            }}
          />

          <div className="flex rounded-md bg-white p-0.5 shadow-xs ring-1 ring-slate-200">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => changeWindow(w.id)}
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

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* ---- kết quả ---- */}
      {showSkeleton ? (
        <GridSkeleton />
      ) : (
        <ShiftList
          shifts={filtered}
          highlightUserId={user?.id ?? null}
          emptyTitle={t('allShifts.empty')}
          emptyHint={t('allShifts.emptyHint')}
          order={filters.order}
        />
      )}

      <div ref={sentinelRef} aria-hidden="true" />
      {loaded.loading && shifts.length > 0 && (
        <p className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          {t('allShifts.loadingMore')}
        </p>
      )}
      {reachedEnd && (
        <p className="py-2 text-center text-xs text-slate-400">
          {t('allShifts.reachedEnd')}
        </p>
      )}
    </div>
  )
}
