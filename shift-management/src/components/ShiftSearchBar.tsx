import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react'
import type { Profile } from '../types'
import type { SortOrder } from '../lib/shiftChunks'
import { DEFAULT_SHIFT_FILTERS, type ShiftFilters } from '../lib/shiftFilters'
import { fromDateKey } from '../lib/time'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { Avatar } from './Avatar'

type Field = keyof ShiftFilters

const FIELDS: { id: Field; label: TranslationKey; icon: typeof User }[] = [
  { id: 'from', label: 'allShifts.filter.from', icon: CalendarDays },
  { id: 'to', label: 'allShifts.filter.to', icon: CalendarDays },
  { id: 'staffIds', label: 'allShifts.filter.staff', icon: User },
  { id: 'order', label: 'allShifts.filter.sort', icon: ArrowDownUp },
]

const SORTS: { id: SortOrder; label: TranslationKey }[] = [
  { id: 'asc', label: 'allShifts.sort.asc' },
  { id: 'desc', label: 'allShifts.sort.desc' },
]

type Popover = { step: 'fields' } | { step: 'edit'; field: Field } | null

interface Chip {
  key: string
  field: Field
  value: string
  /** Bản vá bộ lọc khi bỏ chip này. */
  clear: Partial<ShiftFilters>
}

/**
 * Ô tìm kiếm có bộ lọc nằm ngay bên trong, kiểu thanh lọc của Supabase: mỗi
 * bộ lọc đang bật là một chip, thanh dài ra theo số chip. Bấm chip để sửa,
 * bấm × để bỏ, Backspace khi ô chữ trống thì bỏ chip cuối.
 *
 * Chỉ dùng cho trang Tất cả ca.
 */
export function ShiftSearchBar({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  onClear,
  profiles,
  dateLimits,
}: {
  query: string
  onQueryChange: (query: string) => void
  filters: ShiftFilters
  onFiltersChange: (patch: Partial<ShiftFilters>) => void
  /** Bỏ mọi bộ lọc và chữ tìm kiếm; không đổi tab. */
  onClear: () => void
  profiles: Profile[]
  /** Giới hạn của ô ngày theo tab đang chọn, để không chọn được ngày tab đã loại. */
  dateLimits: {
    from: { min: string | null; max: string | null }
    to: { min: string | null; max: string | null }
  }
}) {
  const { t, dateLocale } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [popover, setPopover] = useState<Popover>(null)
  const [draftDate, setDraftDate] = useState('')

  // Bấm ra ngoài hoặc Esc thì đóng, như mọi menu thả xuống.
  useEffect(() => {
    if (!popover) return
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setPopover(null)
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setPopover(null)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [popover])

  const fmtDate = (key: string) =>
    format(fromDateKey(key), 'd MMM yyyy', { locale: dateLocale })
  const staffName = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? t('common.unknownStaff')

  /**
   * Chip cho từng bộ lọc khác mặc định. Mỗi nhân viên là một chip riêng, để
   * bỏ được từng người mà không mất cả nhóm.
   */
  const chips: Chip[] = []
  if (filters.from) {
    chips.push({
      key: 'from',
      field: 'from',
      value: fmtDate(filters.from),
      clear: { from: null },
    })
  }
  if (filters.to) {
    chips.push({
      key: 'to',
      field: 'to',
      value: fmtDate(filters.to),
      clear: { to: null },
    })
  }
  for (const id of filters.staffIds) {
    chips.push({
      key: `staff-${id}`,
      field: 'staffIds',
      value: staffName(id),
      clear: { staffIds: filters.staffIds.filter((x) => x !== id) },
    })
  }
  if (filters.order !== DEFAULT_SHIFT_FILTERS.order) {
    chips.push({
      key: 'order',
      field: 'order',
      value: t('allShifts.sort.desc'),
      clear: { order: DEFAULT_SHIFT_FILTERS.order },
    })
  }

  /** Loại bộ lọc còn thêm được. Nhân viên thì còn chừng nào chưa chọn hết. */
  const availableFields = FIELDS.filter(({ id }) => {
    if (id === 'from') return !filters.from
    if (id === 'to') return !filters.to
    if (id === 'order') return filters.order === DEFAULT_SHIFT_FILTERS.order
    return filters.staffIds.length < profiles.length
  })
  const labelOf = (field: Field) =>
    t(FIELDS.find((f) => f.id === field)!.label)

  function openEditor(field: Field) {
    if (field === 'from' || field === 'to') setDraftDate(filters[field] ?? '')
    setPopover({ step: 'edit', field })
  }

  function apply(patch: Partial<ShiftFilters>) {
    onFiltersChange(patch)
    setPopover(null)
    inputRef.current?.focus()
  }

  function remove(chip: Chip) {
    onFiltersChange(chip.clear)
    inputRef.current?.focus()
  }

  function toggleStaff(id: string) {
    // Không đóng danh sách: chọn liền nhiều người cho nhanh.
    onFiltersChange({
      staffIds: filters.staffIds.includes(id)
        ? filters.staffIds.filter((x) => x !== id)
        : [...filters.staffIds, id],
    })
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && query === '' && chips.length > 0) {
      e.preventDefault()
      remove(chips[chips.length - 1])
    }
  }

  const hasAnything = chips.length > 0 || query !== ''
  const editing = popover?.step === 'edit' ? popover.field : null

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      {/* Thanh dài ra theo chip; tới giới hạn thì chip xuống dòng. */}
      <div
        className="flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-slate-300 bg-white py-1 pr-1 pl-2.5 shadow-xs transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 sm:min-h-9 sm:max-w-2xl sm:min-w-60"
        onClick={(e) => {
          // Bấm vào khoảng trống của thanh thì focus ô chữ, như một input thật.
          if (e.target === e.currentTarget) inputRef.current?.focus()
        }}
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" />

        {chips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex max-w-full items-center rounded bg-indigo-50 text-xs text-indigo-800 ring-1 ring-indigo-200"
          >
            <button
              type="button"
              onClick={() => openEditor(chip.field)}
              className="truncate py-1 pl-1.5 text-left"
            >
              <span className="text-indigo-500">{labelOf(chip.field)}:</span>{' '}
              <span className="font-medium">{chip.value}</span>
            </button>
            <button
              type="button"
              onClick={() => remove(chip)}
              aria-label={t('allShifts.filter.remove', {
                name: `${labelOf(chip.field)} ${chip.value}`,
              })}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-indigo-500 transition hover:bg-indigo-100 hover:text-indigo-800 sm:h-6 sm:w-6"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={
            chips.length === 0 ? t('list.searchPlaceholder') : t('allShifts.filter.searchMore')
          }
          aria-label={t('list.searchPlaceholder')}
          className="min-w-24 flex-1 bg-transparent py-1 text-base text-slate-900 outline-none placeholder:text-slate-400 sm:py-0.5 sm:text-sm"
        />

        {hasAnything && (
          <button
            type="button"
            onClick={() => {
              onClear()
              setPopover(null)
              inputRef.current?.focus()
            }}
            aria-label={t('allShifts.filter.clear')}
            title={t('allShifts.filter.clear')}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:h-7 sm:w-7"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {availableFields.length > 0 && (
          <button
            type="button"
            onClick={() =>
              setPopover((p) => (p?.step === 'fields' ? null : { step: 'fields' }))
            }
            aria-haspopup="true"
            aria-expanded={popover?.step === 'fields'}
            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded px-2 text-xs font-medium transition sm:h-7 ${
              popover
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t('allShifts.filter.add')}
          </button>
        )}
      </div>

      {popover && (
        <div
          role="dialog"
          aria-label={
            editing
              ? t(FIELDS.find((f) => f.id === editing)!.label)
              : t('allShifts.filter.chooseField')
          }
          className="absolute right-0 left-0 z-30 mt-1 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-slate-900/10 sm:left-auto sm:w-72"
        >
          {/* ---- bước 1: chọn loại bộ lọc ---- */}
          {popover.step === 'fields' && (
            <>
              <p className="px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                {t('allShifts.filter.chooseField')}
              </p>
              {availableFields.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => openEditor(id)}
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 sm:min-h-9"
                >
                  <Icon className="h-4 w-4 text-slate-400" />
                  {t(label)}
                </button>
              ))}
            </>
          )}

          {/* ---- bước 2: chọn giá trị ---- */}
          {(editing === 'from' || editing === 'to') && (
            <form
              className="space-y-2 p-1"
              onSubmit={(e) => {
                e.preventDefault()
                apply({ [editing]: draftDate || null })
              }}
            >
              <label
                htmlFor="shift-filter-date"
                className="block text-xs font-medium text-slate-600"
              >
                {t(editing === 'from' ? 'allShifts.filter.from' : 'allShifts.filter.to')}
              </label>
              <input
                id="shift-filter-date"
                type="date"
                autoFocus
                value={draftDate}
                min={dateLimits[editing].min ?? undefined}
                max={dateLimits[editing].max ?? undefined}
                onChange={(e) => setDraftDate(e.target.value)}
                className="w-full min-h-11 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-base text-slate-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 sm:min-h-0 sm:text-sm"
              />
              {/* Nút áp dụng chứ không áp ngay khi đổi: gõ tay từng chữ số năm
                  thì ô ngày đã phát giá trị như năm 0002. */}
              <button
                type="submit"
                disabled={!draftDate}
                className="w-full min-h-10 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-8"
              >
                {t('allShifts.filter.apply')}
              </button>
            </form>
          )}

          {editing === 'staffIds' && (
            <div className="max-h-64 overflow-y-auto">
              <p className="px-2 pt-1 pb-1.5 text-xs text-slate-500">
                {t('allShifts.filter.staffAndHint')}
              </p>
              {profiles.map((p) => {
                const selected = filters.staffIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleStaff(p.id)}
                    className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition hover:bg-slate-100 sm:min-h-9 ${
                      selected ? 'text-indigo-700' : 'text-slate-700'
                    }`}
                  >
                    <Avatar name={p.display_name} seed={p.id} size="sm" />
                    <span className="truncate">{p.display_name}</span>
                    {selected && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}

          {editing === 'order' &&
            SORTS.map((s) => {
              const selected = s.id === filters.order
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => apply({ order: s.id })}
                  className={`flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm transition hover:bg-slate-100 sm:min-h-9 ${
                    selected ? 'text-indigo-700' : 'text-slate-700'
                  }`}
                >
                  <ArrowDownUp className="h-4 w-4 text-slate-400" />
                  {t(s.label)}
                  {selected && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}
