import type { ReactNode } from 'react'
import { addDays, format } from 'date-fns'
import { ArrowRight } from 'lucide-react'
import type { ActionLog } from '../types'
import { useSchedule } from '../data/ScheduleContext'
import { LocationChip, LocationChips } from './LocationChip'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { SHIFT_COLOR_KEYS, colorByKey, type ShiftColorKey } from '../lib/colors'
import { locationsById } from '../lib/locations'
import { formatRange, fromDateKey } from '../lib/time'

type Rec = Record<string, unknown>

/** Cột kỹ thuật của bản ghi: có trong Nâng cao, ở đây chỉ là nhiễu. */
const HIDDEN = new Set(['id', 'shift_id', 'created_at', 'updated_at'])

/**
 * Các trường đọc được, theo thứ tự hiện. Một trường có thể gộp nhiều cột
 * (giờ bắt đầu + kết thúc thành "18:00 – 23:00"); nó tính là đổi khi một
 * trong các cột đó đổi. Bảng ca, phân công và ca mẫu dùng chung danh sách:
 * cột nào bản ghi không có thì trường đó không hiện.
 */
const FIELDS: { keys: readonly string[]; label: TranslationKey }[] = [
  { keys: ['title'], label: 'log.f.title' },
  // Tên nơi trực (bảng `locations`); ca và ca mẫu dùng `title`.
  { keys: ['name'], label: 'log.f.name' },
  { keys: ['short_name'], label: 'log.f.shortName' },
  { keys: ['user_id'], label: 'log.f.staff' },
  { keys: ['date'], label: 'log.f.date' },
  { keys: ['start_time', 'end_time'], label: 'log.f.time' },
  { keys: ['location_ids'], label: 'log.f.locations' },
  { keys: ['weekdays'], label: 'tpl.repeatOn' },
  { keys: ['status'], label: 'log.f.status' },
  { keys: ['confirmed_at'], label: 'log.f.confirmedAt' },
  { keys: ['is_active'], label: 'tpl.active' },
  { keys: ['color'], label: 'tpl.color' },
  { keys: ['sort_order'], label: 'log.f.order' },
  { keys: ['note'], label: 'log.f.note' },
  { keys: ['template_id'], label: 'log.f.template' },
  { keys: ['created_by'], label: 'log.f.createdBy' },
]
const FIELD_KEYS = new Set(FIELDS.flatMap((f) => f.keys))

/**
 * Khoá ngữ cảnh (metadata) đã được diễn đạt ở chỗ khác — trong các trường
 * của bản ghi, hay trong khối riêng như danh sách người bị gỡ. Khoá lạ (thêm
 * vào trigger sau này) vẫn hiện nguyên tên, để không lặng lẽ mất thông tin.
 */
const KNOWN_META = new Set([
  'shift_id',
  'shift_title',
  'shift_date',
  'target_user_id',
  'target_name',
  'self',
  'old_status',
  'new_status',
  'staff_count',
  'staff_removed',
  'template_title',
  'template_id',
  'shift_created',
  'shift_snapshot',
  'is_active',
  // Tên nơi trực chụp lúc ghi: hiện thành dòng riêng chỉ khi bản ghi không có
  // cột tương ứng (`name` / `location_ids`), xem phần ngữ cảnh bên dưới.
  'location_name',
  'location_names',
])

/** Thứ Hai 1/1/2024 — mốc để lấy tên thứ theo ngôn ngữ đang dùng. */
const A_MONDAY = new Date(2024, 0, 1)

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isColorKey(value: unknown): value is ShiftColorKey {
  return (SHIFT_COLOR_KEYS as readonly unknown[]).includes(value)
}

function same(a: unknown, b: unknown): boolean {
  // Dữ liệu là ảnh chụp jsonb nên so bằng chuỗi JSON là đủ.
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

interface Line {
  key: string
  label: string
  value: ReactNode
  /** Có thì dòng hiện "cũ → mới". */
  before?: ReactNode
  /** Bên nào trống thì chỉ hiện "—", không gạch ngang / tô màu một vạch. */
  beforeEmpty?: boolean
  valueEmpty?: boolean
}

function isBlank(rec: Rec, keys: readonly string[]): boolean {
  return keys.every((k) => {
    const v = rec[k]
    // Lượt không có nơi trực nào lưu `[]` — với nơi trực đó là "trống". (Còn
    // `weekdays` rỗng nghĩa là mọi ngày, nên không áp chung cho mảng.)
    if (k === 'location_ids' && Array.isArray(v)) return v.length === 0
    return v === null || v === undefined || v === ''
  })
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * Chế độ Đơn giản của phần Chi tiết: bản ghi trước / sau và ngữ cảnh của
 * một dòng nhật ký, viết thành câu chữ thay vì JSON — tên người thay cho id,
 * giờ gộp một dòng, trạng thái đã dịch, trường bị đổi hiện "cũ → mới".
 */
export function LogSimpleView({ row }: { row: ActionLog }) {
  const { t, dateLocale } = useI18n()
  const { profilesById, templates, locations } = useSchedule()
  const locationMap = locationsById(locations)
  const isLocation = row.entity_type === 'location'
  const meta = row.metadata
  const before = row.old_data
  const after = row.new_data
  const current: Rec = after ?? before ?? {}
  const isUpdate = before !== null && after !== null

  const empty = <span className="text-slate-400">—</span>

  function personName(id: unknown): string {
    if (typeof id !== 'string') return '?'
    const profile = profilesById.get(id)
    if (profile) return profile.display_name
    // Tài khoản đã bị xoá: dùng tên chụp lại lúc ghi nhật ký nếu có.
    if (id === meta.target_user_id && typeof meta.target_name === 'string') {
      return meta.target_name
    }
    return t('log.unknownActor')
  }

  function dateText(value: unknown): ReactNode {
    if (!isDateKey(value)) return typeof value === 'string' ? value : empty
    return format(fromDateKey(value), 'EEEE, dd/MM/yyyy', { locale: dateLocale })
  }

  function raw(value: unknown): ReactNode {
    if (value === null || value === undefined || value === '') return empty
    return typeof value === 'string' ? value : JSON.stringify(value)
  }

  /** Giá trị đọc được của một trường (theo cột đầu tiên) trong bản ghi `rec`. */
  function show(key: string, rec: Rec): ReactNode {
    const value = rec[key]
    switch (key) {
      case 'user_id':
        if (typeof value !== 'string') return empty
        return (
          <>
            {personName(value)}
            {/* `self` nói về người trong bản ghi mới nhất — chỉ gắn một lần. */}
            {rec === current && meta.self === true && (
              <span
                data-tooltip={t('log.v.selfHint')}
                className="ml-2 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700"
              >
                {t('log.v.self')}
              </span>
            )}
          </>
        )
      case 'created_by':
        return typeof value === 'string' ? personName(value) : empty
      case 'date':
        return dateText(value)
      case 'start_time': {
        const start = rec.start_time
        const end = rec.end_time
        if (typeof start !== 'string' || typeof end !== 'string') {
          return raw(start ?? end)
        }
        return formatRange(start, end)
      }
      case 'status':
        if (value === 'pending') return t('status.pending')
        if (value === 'confirmed') return t('status.confirmed')
        return raw(value)
      case 'confirmed_at': {
        if (typeof value !== 'string') return empty
        const at = new Date(value)
        return Number.isNaN(at.getTime()) ? value : format(at, 'dd/MM/yyyy HH:mm:ss')
      }
      case 'weekdays': {
        if (!Array.isArray(value)) return raw(value)
        if (value.length === 0) return t('tpl.everyDay')
        // Thứ Hai trước, như ô chọn thứ của ca mẫu.
        return [...value]
          .filter((d): d is number => typeof d === 'number')
          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
          .map((d) =>
            format(addDays(A_MONDAY, (d + 6) % 7), 'EEEEEE', { locale: dateLocale }),
          )
          .join(', ')
      }
      case 'location_ids': {
        if (!Array.isArray(value)) return raw(value)
        const ids = stringList(value)
        if (ids.length === 0) return t('log.v.noLocations')
        // Nơi trực đã xoá hiện nhãn "đã xoá" (xoá chỉ được khi không lượt nào
        // còn dùng, nên chỉ gặp ở bản ghi cũ).
        return <LocationChips ids={ids} byId={locationMap} size="xs" />
      }
      case 'sort_order':
        return raw(value)
      case 'is_active':
        if (value === true) return t('log.v.yes')
        if (value === false) return t('log.v.no')
        return raw(value)
      case 'color':
        // Ca mẫu không màu thì lấy màu tự động; nơi trực không màu là nhãn xám.
        if (value === null) return isLocation ? t('loc.noColor') : t('log.v.autoColor')
        if (!isColorKey(value)) return raw(value)
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`h-3 w-3 rounded-full ${colorByKey(value).dot}`} />
            {value}
          </span>
        )
      case 'note':
        return typeof value === 'string' && value.trim() !== '' ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          empty
        )
      case 'template_id':
        if (value === null) return t('log.v.noTemplate')
        return templateName(value)
      default:
        return raw(value)
    }
  }

  function templateName(id: unknown): ReactNode {
    if (typeof id !== 'string') return raw(id)
    return templates.find((tpl) => tpl.id === id)?.title ?? t('log.v.templateGone')
  }

  // ---- các trường của bản ghi ----
  const changes: Line[] = []
  const info: Line[] = []
  const has = (key: string) => key in current || (before !== null && key in before)

  const fields = [
    ...FIELDS.map((f) => ({
      keys: f.keys,
      // "Đang dùng" của ca mẫu, với nơi trực là "Hiện khi nhận ca".
      label: t(isLocation && f.keys[0] === 'is_active' ? 'loc.active' : f.label),
    })),
    // Cột chưa có tên dễ đọc: vẫn hiện, dưới tên gốc.
    ...[...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
      .filter((key) => !HIDDEN.has(key) && !FIELD_KEYS.has(key))
      .map((key) => ({ keys: [key] as readonly string[], label: key })),
  ]

  for (const field of fields) {
    if (!field.keys.some(has)) continue
    const key = field.keys[0]
    const line: Line = { key, label: field.label, value: show(key, current) }
    if (before && after && field.keys.some((k) => !same(before[k], after[k]))) {
      changes.push({
        ...line,
        before: show(key, before),
        beforeEmpty: isBlank(before, field.keys),
        valueEmpty: isBlank(after, field.keys),
      })
    } else {
      info.push(line)
    }
  }

  // ---- ngữ cảnh: chỉ phần bản ghi chưa nói ----
  const context: Line[] = []
  if (!has('title') && (meta.shift_title !== undefined || meta.shift_date !== undefined)) {
    const title = typeof meta.shift_title === 'string' ? meta.shift_title : '?'
    context.push({
      key: 'meta.shift',
      label: t('log.f.shift'),
      value: (
        <>
          {title}
          <span className="text-slate-500"> · {dateText(meta.shift_date)}</span>
        </>
      ),
    })
  }
  if (!has('title') && typeof meta.template_title === 'string') {
    context.push({ key: 'meta.template_title', label: t('log.f.template'), value: meta.template_title })
  }
  if (!has('name') && typeof meta.location_name === 'string') {
    context.push({ key: 'meta.location_name', label: t('log.f.location'), value: meta.location_name })
  }
  // Tên chụp lúc ghi (`location_names`) nói được người đó trực ở đâu khi bản
  // ghi không có `location_ids`, hoặc có id của nơi trực nay đã xoá (chip chỉ
  // còn "đã xoá"). Hiện thành danh sách riêng: thứ tự tên không khớp thứ tự id.
  const metaLocationNames = stringList(meta.location_names)
  const recordLocationIds = [
    ...stringList(before?.location_ids),
    ...stringList(after?.location_ids),
  ]
  const hasDeletedLocation = recordLocationIds.some((id) => !locationMap.has(id))
  if (
    metaLocationNames.length > 0 &&
    (!has('location_ids') || hasDeletedLocation)
  ) {
    context.push({
      key: 'meta.location_names',
      label: t(has('location_ids') ? 'log.f.locationsAtTime' : 'log.f.locations'),
      value: (
        <span className="inline-flex flex-wrap items-center gap-1">
          {metaLocationNames.map((name) => (
            <LocationChip
              key={name}
              name={name}
              location={locations.find((l) => l.name === name) ?? null}
              size="xs"
            />
          ))}
        </span>
      ),
    })
  }
  if (!has('user_id') && typeof meta.target_user_id === 'string') {
    context.push({ key: 'meta.target', label: t('log.f.staff'), value: personName(meta.target_user_id) })
  }
  if (!has('template_id') && 'template_id' in meta) {
    context.push({ key: 'meta.template_id', label: t('log.f.template'), value: templateName(meta.template_id) })
  }
  if (typeof meta.shift_created === 'boolean') {
    context.push({
      key: 'meta.shift_created',
      label: t('log.f.newShift'),
      value: meta.shift_created ? t('log.v.yes') : t('log.v.no'),
    })
  }
  for (const [key, value] of Object.entries(meta)) {
    if (KNOWN_META.has(key)) continue
    context.push({ key: `meta.${key}`, label: key, value: raw(value) })
  }

  const removed = Array.isArray(meta.staff_removed)
    ? (meta.staff_removed.filter((r) => r && typeof r === 'object') as Rec[])
    : []

  return (
    <div className="space-y-3">
      {changes.length > 0 && (
        <Section title={t('log.simple.changes')}>
          {changes.map((line) => (
            <Row key={line.key} label={line.label}>
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {line.beforeEmpty ? (
                  line.before
                ) : (
                  <span className="text-rose-700 line-through decoration-rose-300">
                    {line.before}
                  </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {line.valueEmpty ? (
                  line.value
                ) : (
                  <span className="font-medium text-emerald-700">{line.value}</span>
                )}
              </span>
            </Row>
          ))}
        </Section>
      )}
      {isUpdate && changes.length === 0 && (
        <p className="text-xs text-slate-500">{t('log.simple.noChanges')}</p>
      )}

      {context.length + info.length > 0 && (
        <Section title={t('log.simple.info')}>
          {[...context, ...info].map((line) => (
            <Row key={line.key} label={line.label}>
              {line.value}
            </Row>
          ))}
        </Section>
      )}

      {removed.length > 0 && (
        <Section title={t('log.simple.removed', { count: removed.length })}>
          {removed.map((r, i) => (
            <Row
              key={typeof r.assignment_id === 'string' ? r.assignment_id : i}
              label={
                typeof r.user_id === 'string' && profilesById.has(r.user_id)
                  ? personName(r.user_id)
                  : typeof r.name === 'string'
                    ? r.name
                    : '?'
              }
            >
              {show('start_time', r)}
              <span className="text-slate-500"> · {show('status', r)}</span>
              {stringList(r.location_ids).length > 0 && (
                <span className="mt-0.5 block">{show('location_ids', r)}</span>
              )}
              {typeof r.note === 'string' && r.note.trim() !== '' && (
                <span className="block text-slate-500">{show('note', r)}</span>
              )}
            </Row>
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {title}
      </p>
      <dl className="divide-y divide-slate-100 rounded-md bg-white text-sm ring-1 ring-slate-200">
        {children}
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 px-3 py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="break-words text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800 select-text">{children}</dd>
    </div>
  )
}
