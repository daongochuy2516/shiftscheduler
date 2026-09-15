import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ScrollText,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import type { ActionLog, ActionLogFilters, ActionLogQuery } from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { useActionLogs } from '../data/useActionLogs'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { Avatar } from '../components/Avatar'
import { PageSkeleton } from '../components/PageSkeleton'
import { StaffMultiSelect } from '../components/StaffMultiSelect'

const PAGE_SIZE = 50

/**
 * Liệt kê cứng thay vì suy ra từ dữ liệu: bộ lọc phải ổn định, không phụ thuộc
 * vào việc trang hiện tại tình cờ chứa hành động nào.
 */
const ACTIONS = [
  'shift.created',
  'shift.updated',
  'shift.deleted',
  'assignment.created',
  'assignment.claimed',
  'assignment.updated',
  'assignment.status_changed',
  'assignment.deleted',
  'template.created',
  'template.updated',
  'template.toggled',
  'template.deleted',
] as const

const ENTITY_TYPES = ['shift', 'assignment', 'template'] as const

/** Màu theo tính chất việc làm: tạo, sửa, xoá. */
function actionTone(action: string): string {
  if (action.endsWith('.deleted')) return 'bg-rose-50 text-rose-700 ring-rose-200'
  if (action.endsWith('.created') || action.endsWith('.claimed')) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (action.endsWith('.status_changed') || action.endsWith('.toggled')) {
    return 'bg-amber-50 text-amber-800 ring-amber-200'
  }
  return 'bg-sky-50 text-sky-700 ring-sky-200'
}

const emptyFilters: ActionLogFilters = {
  from: null,
  to: null,
  staffIds: [],
  action: null,
  entityType: null,
  search: null,
}

const controlClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export function ActionLogPage() {
  const { t } = useI18n()
  const { profiles } = useSchedule()

  const [filters, setFilters] = useState<ActionLogFilters>(emptyFilters)
  const [searchInput, setSearchInput] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Gõ tới đâu gọi API tới đó thì quá tốn; chờ người dùng ngừng gõ.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput.trim() || null }))
    }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // Đổi bộ lọc mà giữ nguyên số trang sẽ cho ra một trang trống khó hiểu.
  useEffect(() => {
    setPageIndex(0)
  }, [filters])

  const query = useMemo<ActionLogQuery>(
    () => ({ ...filters, page: pageIndex, pageSize: PAGE_SIZE }),
    [filters, pageIndex],
  )

  const { page, available, loading, error, reload } = useActionLogs(query)

  function patch(next: Partial<ActionLogFilters>) {
    setFilters((f) => ({ ...f, ...next }))
  }

  function resetFilters() {
    setFilters(emptyFilters)
    setSearchInput('')
  }

  const activeFilterCount = [
    filters.from,
    filters.to,
    filters.staffIds.length > 0 ? filters.staffIds : null,
    filters.action,
    filters.entityType,
    filters.search,
  ].filter((v) => v !== null).length
  const hasFilters = activeFilterCount > 0

  if (loading && page === null) return <PageSkeleton />

  if (!available) {
    return (
      <div className="space-y-4">
        <Heading />
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm ring-1 ring-amber-200">
          <p className="font-medium text-amber-900">{t('log.notInstalled')}</p>
          <p className="mt-0.5 text-amber-800">{t('log.notInstalledHint')}</p>
        </div>
      </div>
    )
  }

  const total = page?.total ?? 0
  const rows = page?.rows ?? []
  const first = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const last = Math.min(total, (pageIndex + 1) * PAGE_SIZE)
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Heading />
        <button
          type="button"
          onClick={reload}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:bg-slate-50"
        >
          <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('log.refresh')}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* ---- bộ lọc ---- */}
      {/* Mobile: gập bộ lọc lại, mở ra khi cần. Sáu ô luôn hiện sẽ đẩy danh
          sách log — thứ người ta thật sự vào đây để đọc — xuống dưới màn hình. */}
      <button
        type="button"
        onClick={() => setFiltersOpen((v) => !v)}
        aria-expanded={filtersOpen}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white px-3 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-900/5 sm:hidden"
      >
        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
        {t('nav.filters')}
        {hasFilters && (
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${
            filtersOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <section
        className={`rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5 ${
          filtersOpen ? '' : 'hidden sm:block'
        }`}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className={labelClass} htmlFor="log-from">
              {t('log.from')}
            </label>
            <input
              id="log-from"
              type="date"
              className={controlClass}
              value={filters.from ?? ''}
              onChange={(e) => patch({ from: e.target.value || null })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-to">
              {t('log.to')}
            </label>
            <input
              id="log-to"
              type="date"
              className={controlClass}
              value={filters.to ?? ''}
              onChange={(e) => patch({ to: e.target.value || null })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-staff">
              {t('log.staff')}
            </label>
            <StaffMultiSelect
              id="log-staff"
              className={controlClass}
              profiles={profiles}
              value={filters.staffIds}
              onChange={(staffIds) => patch({ staffIds })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-action">
              {t('log.action')}
            </label>
            <select
              id="log-action"
              className={controlClass}
              value={filters.action ?? ''}
              onChange={(e) => patch({ action: e.target.value || null })}
            >
              <option value="">{t('log.allActions')}</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {t(`log.action.${a}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="log-entity">
              {t('log.entity')}
            </label>
            <select
              id="log-entity"
              className={controlClass}
              value={filters.entityType ?? ''}
              onChange={(e) => patch({ entityType: e.target.value || null })}
            >
              <option value="">{t('log.allEntities')}</option>
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>
                  {t(`log.entity.${e}` as TranslationKey)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="log-search">
              {t('log.search')}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="log-search"
                className={`${controlClass} pl-8`}
                placeholder={t('log.searchPlaceholder')}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-2 text-xs font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
          >
            {t('log.reset')}
          </button>
        )}
      </section>

      {/* ---- kết quả ---- */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-900/5">
          <ScrollText className="h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">
            {hasFilters ? t('log.empty') : t('log.emptyFresh')}
          </p>
          <p className="text-sm text-slate-500">
            {hasFilters ? t('log.emptyHint') : t('log.emptyFreshHint')}
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-900/5">
            {rows.map((row) => (
              <LogRow key={row.id} row={row} />
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-500 tabular-nums">
              {t('log.showing', { first, last, total })}
            </p>
            <div className="ml-auto flex items-center rounded-md bg-white shadow-xs ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={pageIndex === 0}
                aria-label={t('log.prev')}
                className="rounded-l-md px-2 py-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="border-x border-slate-200 px-3 py-1.5 text-sm text-slate-600 tabular-nums">
                {pageIndex + 1} / {lastPage + 1}
              </span>
              <button
                type="button"
                onClick={() => setPageIndex((p) => Math.min(lastPage, p + 1))}
                disabled={pageIndex >= lastPage}
                aria-label={t('log.next')}
                className="rounded-r-md px-2 py-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  function Heading() {
    return (
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ScrollText className="h-5 w-5 shrink-0 text-slate-400" />
          {t('log.title')}
        </h1>
        <p className="text-sm text-slate-500">{t('log.subtitle')}</p>
      </div>
    )
  }
}

function LogRow({ row }: { row: ActionLog }) {
  const { t, dateLocale } = useI18n()
  const [open, setOpen] = useState(false)

  const at = new Date(row.created_at)
  const actorName = row.actor_name ?? (row.actor_id ? t('log.unknownActor') : t('log.system'))
  const actionLabel = t(`log.action.${row.action}` as TranslationKey)
  const entityLabel = t(`log.entity.${row.entity_type}` as TranslationKey)
  const hasDetails = row.old_data !== null || row.new_data !== null

  return (
    <li>
      {/* Mobile: mô tả là thứ quan trọng nhất nên được một hàng riêng, đủ chỗ
          xuống dòng. Thời gian, người làm và các nhãn lùi xuống làm dữ liệu
          phụ. Trên PC vẫn là một hàng ngang như cũ. */}
      <div className="px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:contents">
          <time
            dateTime={row.created_at}
            className="shrink-0 text-xs text-slate-500 tabular-nums sm:w-36"
            title={format(at, 'PPPPp', { locale: dateLocale })}
          >
            {format(at, 'dd/MM/yyyy HH:mm:ss')}
          </time>

          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={actorName} seed={row.actor_id ?? 'system'} size="sm" />
            <span className="truncate text-sm font-medium text-slate-800">
              {actorName}
            </span>
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:mt-0 sm:contents">
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${actionTone(row.action)}`}
          >
            {actionLabel}
          </span>

          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {entityLabel}
          </span>
        </div>

        {/* break-words: mô tả chứa tên ca do người dùng đặt, có thể là một
            chuỗi dài không dấu cách và sẽ làm tràn ngang cả trang. */}
        <p className="mt-1.5 min-w-0 text-sm break-words text-slate-700 sm:mt-0 sm:flex-1">
          {row.summary}
        </p>

        {hasDetails && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-1.5 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:mt-0 sm:min-h-0 sm:py-1"
          >
            {t('log.details')}
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {open && hasDetails && (
        <div className="grid gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 md:grid-cols-2">
          {row.old_data && (
            <JsonBlock title={t('log.before')} value={row.old_data} />
          )}
          {row.new_data && (
            <JsonBlock title={t('log.after')} value={row.new_data} />
          )}
          {Object.keys(row.metadata).length > 0 && (
            <div className="md:col-span-2">
              <JsonBlock title={t('log.context')} value={row.metadata} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function JsonBlock({
  title,
  value,
}: {
  title: string
  value: Record<string, unknown>
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      <pre className="overflow-x-auto rounded-md bg-white p-2 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}
