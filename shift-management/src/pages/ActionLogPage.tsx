import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import {
  Braces,
  CalendarSearch,
  CalendarX,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  RotateCw,
  ScrollText,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import type { ActionLog, ActionLogFilters, ActionLogQuery, UUID } from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { useActionLogs } from '../data/useActionLogs'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { Avatar } from '../components/Avatar'
import { PageSkeleton } from '../components/PageSkeleton'
import { Select } from '../components/Select'
import { DateInput } from '../components/DateInput'
import { StaffMultiSelect } from '../components/StaffMultiSelect'
import { useShiftEditor } from '../components/ShiftEditorProvider'
import { LogSimpleView } from '../components/LogSimpleView'
import { useNotify } from '../notifications/NotificationContext'
import { effectiveAction, isCheckInAction, shiftTarget } from '../lib/actionLog'
import { isNetworkError } from '../lib/network'
import { useUrlParams, useUrlText, type UrlValue } from '../lib/urlParams'
import {
  orderedRange,
  useCanonicalParams,
  validDateParam,
} from '../lib/canonicalParams'
import { LoadError } from '../components/LoadError'

const PAGE_SIZE = 50
/** Đổi chữ tìm thì về trang 1. */
const PAGE_RESET = ['page']

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
  // Hai chiều của đổi trạng thái, lọc riêng được (lib/actionLog.ts).
  'assignment.confirmed',
  'assignment.unconfirmed',
  'assignment.deleted',
  'template.created',
  'template.updated',
  'template.toggled',
  'template.deleted',
  'location.created',
  'location.updated',
  'location.toggled',
  'location.deleted',
] as const

const ENTITY_TYPES = ['shift', 'assignment', 'template', 'location'] as const

/** Màu theo tính chất việc làm: tạo, sửa, xoá. */
function actionTone(action: string): string {
  if (action.endsWith('.deleted') || action.endsWith('.unconfirmed')) {
    return 'bg-rose-50 text-rose-700 ring-rose-200'
  }
  if (
    action.endsWith('.created') ||
    action.endsWith('.claimed') ||
    action.endsWith('.confirmed')
  ) {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (action.endsWith('.status_changed') || action.endsWith('.toggled')) {
    return 'bg-amber-50 text-amber-800 ring-amber-200'
  }
  return 'bg-sky-50 text-sky-700 ring-sky-200'
}

/**
 * Kiểu xem phần Chi tiết. Trên URL là `detail=advanced` (Đơn giản là mặc
 * định, không ghi) để link gửi đi mở ra đúng kiểu đang xem; máy vẫn nhớ
 * lựa chọn gần nhất để lần đầu mở một dòng (URL chưa có dòng nào mở) dùng
 * lại thói quen đó. URL có thì URL thắng. Không đọc được thì Đơn giản.
 */
type DetailMode = 'simple' | 'advanced'
const DETAIL_MODE_KEY = 'scheduler.logDetailMode'

function readDetailMode(): DetailMode {
  try {
    return localStorage.getItem(DETAIL_MODE_KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

function writeDetailMode(mode: DetailMode) {
  try {
    localStorage.setItem(DETAIL_MODE_KEY, mode)
  } catch {
    // Trình duyệt chặn lưu trữ: lần sau về mặc định, không sao.
  }
}

const controlClass =
  'w-full min-h-11 sm:min-h-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base sm:text-sm text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
const labelClass = 'block text-xs font-medium text-slate-600 mb-1'

export function ActionLogPage() {
  const { t } = useI18n()
  const {
    profiles,
    loading: scheduleLoading,
    error: scheduleError,
  } = useSchedule()

  // Bộ lọc và số trang nằm trên URL — copy link gửi người khác là ra đúng
  // những dòng mình đang xem: `from` `to` `staff` (lặp lại) `action`
  // `entity` `q` `page` (từ 1, bỏ trống = trang 1), cùng các dòng đang mở
  // Chi tiết `log` (lặp lại) và kiểu xem `detail`.
  const [params, updateParams] = useUrlParams()
  const { from: fromParam, to: toParam } = orderedRange(
    validDateParam(params.get('from')),
    validDateParam(params.get('to')),
  )
  const actionRaw = params.get('action')
  const actionParam =
    actionRaw && (ACTIONS as readonly string[]).includes(actionRaw) ? actionRaw : null
  const entityRaw = params.get('entity')
  const entityParam =
    entityRaw && (ENTITY_TYPES as readonly string[]).includes(entityRaw)
      ? entityRaw
      : null
  // Danh sách chọn người ở đây là mọi hồ sơ (cả người đang ẩn: nhật ký vẫn
  // có việc họ làm), nên chỉ bỏ id không có trong `profiles`.
  const rawStaff = params.getAll('staff')
  const profilesReady = !scheduleLoading && !scheduleError
  const staffIds = profilesReady
    ? [...new Set(rawStaff)].filter((id) => profiles.some((p) => p.id === id))
    : rawStaff
  const staffParam = staffIds.join('\n')
  const searchParam = params.get('q')
  // Phụ thuộc vào từng giá trị chứ không vào cả `params`: mở một dòng Chi
  // tiết hay mở form ca cũng đổi URL, và không được làm tải lại nhật ký.
  const filters = useMemo<ActionLogFilters>(
    () => ({
      from: fromParam,
      to: toParam,
      staffIds: staffParam ? staffParam.split('\n') : [],
      action: actionParam,
      entityType: entityParam,
      search: searchParam,
    }),
    [fromParam, toParam, staffParam, actionParam, entityParam, searchParam],
  )
  // Chỉ số nguyên dương; "1.5", "0", "abc" đều là trang 1.
  const pageRaw = params.get('page')
  const pageNumber =
    pageRaw && /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1
  const pageIndex = pageNumber - 1
  const setPageIndex = (index: number) =>
    updateParams({ page: index > 0 ? String(index + 1) : null })
  // Gõ tới đâu gọi API tới đó thì quá tốn: hook chờ ngừng gõ rồi mới ghi `q`
  // lên URL (và về trang 1).
  const [searchInput, setSearchInput] = useUrlText('q', PAGE_RESET)
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Các dòng đang mở Chi tiết và kiểu xem nằm trên URL. Kiểu xem giữ ở trang
  // chứ không ở từng dòng: đổi ở một dòng thì mọi dòng đang mở đổi theo.
  const openLogIds = params.getAll('log')
  const detailMode: DetailMode =
    params.get('detail') === 'advanced' ? 'advanced' : 'simple'
  function setDetailMode(mode: DetailMode) {
    writeDetailMode(mode)
    updateParams({ detail: mode === 'advanced' ? 'advanced' : null })
  }
  function toggleLog(id: UUID) {
    if (openLogIds.includes(id)) {
      const rest = openLogIds.filter((x) => x !== id)
      // Không còn dòng nào mở thì kiểu xem cũng không còn gì để chỉ.
      updateParams(rest.length ? { log: rest } : { log: null, detail: null })
    } else if (openLogIds.length === 0) {
      // Dòng đầu tiên được mở: lấy kiểu xem quen dùng trên máy này.
      updateParams({
        log: [id],
        detail: readDetailMode() === 'advanced' ? 'advanced' : null,
      })
    } else {
      updateParams({ log: [...openLogIds, id] })
    }
  }

  // Điểm danh / Gỡ điểm danh không có trong dữ liệu (đều là "Đổi trạng
  // thái"): hỏi máy chủ hành động gốc, rồi lọc chiều ngay trong trang tải về.
  const checkInFilter =
    filters.action && isCheckInAction(filters.action) ? filters.action : null
  const query = useMemo<ActionLogQuery>(
    () => ({
      ...filters,
      action: checkInFilter ? 'assignment.status_changed' : filters.action,
      page: pageIndex,
      pageSize: PAGE_SIZE,
    }),
    [filters, checkInFilter, pageIndex],
  )

  const { page, available, loading, error, reload } = useActionLogs(query)

  // `page` / `error` của hook có thể còn là của bộ lọc trước (một nhịp vẽ
  // ngay sau khi URL đổi, trước khi hook kịp bắt đầu tải). Ghi nhớ bộ lọc
  // nào vừa tải xong để chỉ sửa URL theo kết quả của đúng bộ lọc đang xem.
  const [prevLoading, setPrevLoading] = useState(loading)
  const [settledQuery, setSettledQuery] = useState<ActionLogQuery | null>(null)
  if (loading !== prevLoading) {
    setPrevLoading(loading)
    if (!loading) setSettledQuery(query)
  }
  const settled = !loading && settledQuery === query

  const total = page?.total ?? 0
  const pageRows = page?.rows ?? []
  const rows = checkInFilter
    ? pageRows.filter((row) => effectiveAction(row) === checkInFilter)
    : pageRows
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  // ---- URL khớp với thứ đang hiện ----------------------------------------
  // Trang vượt quá số trang: Supabase trả lỗi "range not satisfiable" (không
  // kèm tổng), bản mẫu trả trang rỗng kèm tổng. Cả hai về trang hợp lệ.
  const outOfRange =
    settled &&
    pageIndex > 0 &&
    ((error !== null && /range not satisfiable/i.test(error)) ||
      (error === null && page !== null && pageIndex > lastPage))
  const canonicalPage = outOfRange
    ? error !== null || lastPage === 0
      ? null
      : String(lastPage + 1)
    : pageIndex > 0
      ? String(pageNumber)
      : null
  // Dòng đang mở mà không còn trên trang (đổi trang, đổi bộ lọc, link cũ)
  // hay không có gì để xem thì gỡ khỏi URL; chỉ quyết khi trang đã tải xong.
  const shownLogIds = settled && error === null && page !== null
    ? openLogIds.filter((id, i) =>
        openLogIds.indexOf(id) === i &&
        rows.some(
          (row) => row.id === id && (row.old_data !== null || row.new_data !== null),
        ),
      )
    : openLogIds
  useCanonicalParams({
    from: fromParam,
    to: toParam,
    action: actionParam,
    entity: entityParam,
    page: canonicalPage,
    ...(profilesReady ? { staff: staffIds } : {}),
    log: shownLogIds,
    detail: shownLogIds.length > 0 && detailMode === 'advanced' ? 'advanced' : null,
  })

  // Đổi bộ lọc mà giữ nguyên số trang sẽ cho ra một trang trống khó hiểu:
  // mọi lần đổi bộ lọc đều về trang 1.
  function patch(next: Partial<ActionLogFilters>) {
    const url: Record<string, UrlValue> = { page: null }
    if ('from' in next) url.from = next.from
    if ('to' in next) url.to = next.to
    if ('staffIds' in next) url.staff = next.staffIds
    if ('action' in next) url.action = next.action
    if ('entityType' in next) url.entity = next.entityType
    updateParams(url)
  }

  function resetFilters() {
    updateParams({
      from: null,
      to: null,
      staff: null,
      action: null,
      entity: null,
      q: null,
      page: null,
    })
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

  const first = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const last = Math.min(total, (pageIndex + 1) * PAGE_SIZE)

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
        <LoadError message={error} />
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
            <DateInput
              id="log-from"
              clearable
              className={controlClass}
              value={filters.from ?? ''}
              max={filters.to}
              onChange={(from) => patch({ from: from || null })}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-to">
              {t('log.to')}
            </label>
            <DateInput
              id="log-to"
              clearable
              className={controlClass}
              value={filters.to ?? ''}
              min={filters.from}
              onChange={(to) => patch({ to: to || null })}
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
            <Select
              id="log-action"
              className={controlClass}
              value={filters.action ?? ''}
              onChange={(action) => patch({ action: action || null })}
              options={[
                { value: '', label: t('log.allActions') },
                ...ACTIONS.map((a) => ({
                  value: a,
                  label: t(`log.action.${a}` as TranslationKey),
                })),
              ]}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="log-entity">
              {t('log.entity')}
            </label>
            <Select
              id="log-entity"
              className={controlClass}
              value={filters.entityType ?? ''}
              onChange={(entityType) => patch({ entityType: entityType || null })}
              options={[
                { value: '', label: t('log.allEntities') },
                ...ENTITY_TYPES.map((e) => ({
                  value: e,
                  label: t(`log.entity.${e}` as TranslationKey),
                })),
              ]}
            />
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
      {/* Lọc Điểm danh / Gỡ điểm danh làm trên từng trang tải về, nên một
          trang có thể trống mà trang sau vẫn có: chỉ hiện màn hình trống khi
          chính máy chủ không trả gì, còn lại vẫn giữ nút chuyển trang. */}
      {pageRows.length === 0 ? (
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
              <LogRow
                key={row.id}
                row={row}
                open={openLogIds.includes(row.id)}
                onToggle={() => toggleLog(row.id)}
                detailMode={detailMode}
                onDetailModeChange={setDetailMode}
              />
            ))}
            {rows.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-slate-500">
                {t('log.emptyPage')}
              </li>
            )}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            {/* Tổng của máy chủ là tổng "Đổi trạng thái" — đếm sai khi đang
                lọc một chiều, nên không hiện. */}
            {!checkInFilter && (
              <p className="text-sm text-slate-500 tabular-nums">
                {t('log.showing', { first, last, total })}
              </p>
            )}
            <div className="ml-auto flex items-center rounded-md bg-white shadow-xs ring-1 ring-slate-200">
              <button
                type="button"
                onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
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
                onClick={() => setPageIndex(Math.min(lastPage, pageIndex + 1))}
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

function LogRow({
  row,
  open,
  onToggle,
  detailMode,
  onDetailModeChange,
}: {
  row: ActionLog
  /** Đang mở Chi tiết — nằm trên URL (`log=<id>`), do trang giữ. */
  open: boolean
  onToggle: () => void
  detailMode: DetailMode
  onDetailModeChange: (mode: DetailMode) => void
}) {
  const { t, dateLocale } = useI18n()

  const at = new Date(row.created_at)
  const actorName = row.actor_name ?? (row.actor_id ? t('log.unknownActor') : t('log.system'))
  const action = effectiveAction(row)
  const actionLabel = t(`log.action.${action}` as TranslationKey)
  const entityLabel = t(`log.entity.${row.entity_type}` as TranslationKey)
  const hasDetails = row.old_data !== null || row.new_data !== null
  const target = shiftTarget(row)

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
            data-tooltip={format(at, 'PPPPp', { locale: dateLocale })}
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
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${actionTone(action)}`}
          >
            {actionLabel}
          </span>

          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {entityLabel}
          </span>
        </div>

        {/* break-words: mô tả chứa tên ca do người dùng đặt, có thể là một
            chuỗi dài không dấu cách và sẽ làm tràn ngang cả trang. */}
        <p className="mt-1.5 min-w-0 text-sm break-words text-slate-700 select-text sm:mt-0 sm:flex-1">
          {row.summary}
        </p>

        {(target || hasDetails) && (
          <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-1 sm:mt-0">
            {target && (
              <ShiftInfoButton
                shiftId={target.shiftId}
                assignmentId={target.assignmentId}
              />
            )}
            {hasDetails && (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 sm:min-h-0 sm:py-1"
              >
                {t('log.details')}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>
            )}
          </div>
        )}
      </div>

      {open && hasDetails && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
          <div
            role="group"
            aria-label={t('log.view.label')}
            className="flex rounded-md bg-slate-200/60 p-0.5 sm:inline-flex"
          >
            {(
              [
                { id: 'simple', label: 'log.view.simple', Icon: List },
                { id: 'advanced', label: 'log.view.advanced', Icon: Braces },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onDetailModeChange(id)}
                aria-pressed={detailMode === id}
                className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded px-3 text-sm font-medium transition sm:min-h-0 sm:flex-none sm:py-1 sm:text-xs ${
                  detailMode === id
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(label)}
              </button>
            ))}
          </div>

          {detailMode === 'simple' ? (
            <LogSimpleView row={row} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {row.old_data && (
                <JsonBlock
                  title={t('log.before')}
                  value={row.old_data}
                  diff={row.new_data && { against: row.new_data, side: 'old' }}
                />
              )}
              {row.new_data && (
                <JsonBlock
                  title={t('log.after')}
                  value={row.new_data}
                  diff={row.old_data && { against: row.old_data, side: 'new' }}
                />
              )}
              {Object.keys(row.metadata).length > 0 && (
                <div className="md:col-span-2">
                  <JsonBlock title={t('log.context')} value={row.metadata} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Mở form sửa của ca mà dòng nhật ký nói tới. Dòng chỉ giữ id, và ca có thể
 * đã đổi ngày hay bị xoá từ đó tới giờ, nên hỏi máy chủ lúc bấm thay vì
 * dựng lại ca từ ảnh chụp trong nhật ký.
 *
 * Tự hỏi trước rồi mới mở (thay vì `openEditById` để form tự tìm) để nút
 * biết ca đã bị xoá mà đổi thành nhãn "Ca đã bị xoá". Bản vừa tải được đưa
 * thẳng cho form nên không phải hỏi lại lần hai; URL vẫn là `shift=<id>`
 * như mọi nơi khác.
 */
function ShiftInfoButton({
  shiftId,
  assignmentId,
}: {
  shiftId: UUID
  assignmentId: UUID | null
}) {
  const { t } = useI18n()
  const { fetchShift } = useSchedule()
  const { openEdit } = useShiftEditor()
  const { notify, error: notifyError } = useNotify()
  const [status, setStatus] = useState<'idle' | 'loading' | 'gone'>('idle')

  async function open() {
    setStatus('loading')
    try {
      const shift = await fetchShift(shiftId)
      if (!shift) {
        setStatus('gone')
        return
      }
      setStatus('idle')
      openEdit(shift, assignmentId ?? undefined)
    } catch (err) {
      setStatus('idle')
      // Câu mạng mặc định của useNotify nói về phép ghi ("chưa gửi gì đi");
      // đây là phép đọc không có bản lưu trên máy.
      if (isNetworkError(err)) {
        notify({ kind: 'error', title: 'notif.shift.openFailed', bodyKey: 'offline.noCache' })
      } else {
        notifyError('notif.shift.openFailed', err)
      }
    }
  }

  if (status === 'gone') {
    return (
      <span
        data-tooltip={t('log.shiftGoneHint')}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 px-2 text-xs font-medium text-slate-400 sm:min-h-0 sm:py-1"
      >
        <CalendarX className="h-3.5 w-3.5" />
        {t('log.shiftGone')}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={status === 'loading'}
      data-tooltip={t('log.shiftInfoHint')}
      className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800 disabled:opacity-60 sm:min-h-0 sm:py-1"
    >
      {status === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <CalendarSearch className="h-3.5 w-3.5" />
      )}
      {t('log.shiftInfo')}
    </button>
  )
}

const DIFF_TONE = {
  old: { mark: '-', line: 'bg-rose-50 text-rose-800' },
  new: { mark: '+', line: 'bg-emerald-50 text-emerald-800' },
} as const

/** Một trường của bản ghi, dạng `"key": value,` như JSON.stringify(…, null, 2). */
function jsonEntry(key: string, value: unknown, last: boolean): string {
  const body = JSON.stringify(value, null, 2) ?? 'null'
  return ` "${key}": ${body.replaceAll('\n', '\n  ')}${last ? '' : ','}`
}

function JsonBlock({
  title,
  value,
  diff,
}: {
  title: string
  value: Record<string, unknown>
  /** Có cả bản trước lẫn sau: tô những trường khác nhau giữa hai bản. */
  diff?: { against: Record<string, unknown>; side: 'old' | 'new' } | null
}) {
  const keys = Object.keys(value)
  const tone = diff ? DIFF_TONE[diff.side] : null
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      <pre className="overflow-x-auto rounded-md bg-white py-2 text-[11px] leading-relaxed text-slate-700 ring-1 ring-slate-200 select-text">
        {diff && tone ? (
          // w-max + min-w-full: dòng được tô phủ hết bề ngang kể cả khi phải
          // cuộn ngang, thay vì dừng ở mép khung.
          <code className="block w-max min-w-full">
            <span className="block px-2">{'{'}</span>
            {keys.map((key, i) => {
              // So bằng chuỗi JSON: dữ liệu là ảnh chụp jsonb, thứ tự khoá ổn định.
              const changed =
                !(key in diff.against) ||
                JSON.stringify(value[key]) !== JSON.stringify(diff.against[key])
              return (
                <span
                  key={key}
                  className={`block px-2 ${changed ? tone.line : ''}`}
                >
                  {changed ? tone.mark : ' '}
                  {jsonEntry(key, value[key], i === keys.length - 1)}
                </span>
              )
            })}
            <span className="block px-2">{'}'}</span>
          </code>
        ) : (
          <code className="block px-2">{JSON.stringify(value, null, 2)}</code>
        )}
      </pre>
    </div>
  )
}
