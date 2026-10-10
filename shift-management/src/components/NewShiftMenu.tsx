import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Layers,
  PenLine,
  Plus,
  Settings2,
} from 'lucide-react'
import type { ShiftTemplate } from '../types'
import { useAuth } from '../auth/AuthContext'
import { useSchedule } from '../data/ScheduleContext'
import { canManageTemplates } from '../lib/attendance'
import { useI18n } from '../i18n/I18nContext'
import { templateColor } from '../lib/colors'
import { formatRange } from '../lib/time'
import { useExitAnimation } from './useExitAnimation'

/**
 * Nội dung của nút Tạo ca: hai lựa chọn — nhận một ca mẫu, hay tạo ca thủ
 * công. Chọn "Nhận ca mẫu" thì hiện danh sách mẫu ngay trong menu; bấm một
 * mẫu là mở form chọn ngày (ClaimTemplateModal) như nút "Nhận ca" ở thanh ca
 * mẫu. Dùng chung cho menu xổ xuống trên PC và bảng trượt trên điện thoại.
 */
export function NewShiftChooser({
  onManual,
  onTemplate,
  onManage,
  startAtTemplates = false,
}: {
  onManual: () => void
  onTemplate: (template: ShiftTemplate) => void
  /** Mở hộp Quản lý ca mẫu. Chỉ hiện với người được quản lý (admin, 008). */
  onManage: () => void
  /** Mở thẳng vào danh sách ca mẫu (lệnh "Nhận ca mẫu" trong Ctrl + K). */
  startAtTemplates?: boolean
}) {
  const { t, dateLocale } = useI18n()
  const { templates, templatesAvailable } = useSchedule()
  const { user } = useAuth()
  const canManage = templatesAvailable && canManageTemplates(user)
  const active = useMemo(() => templates.filter((tpl) => tpl.is_active), [templates])
  const [picking, setPicking] = useState(
    () => startAtTemplates && templatesAvailable && active.length > 0,
  )

  /** "T2, T4, T6" theo ngôn ngữ đang chọn; trống = lặp mọi ngày. */
  const weekdayNames = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i)
      return { value: day.getDay(), label: format(day, 'EEEEEE', { locale: dateLocale }) }
    })
  }, [dateLocale])
  const repeatLabel = (weekdays: number[]) =>
    weekdays.length === 0
      ? t('tpl.everyDay')
      : weekdayNames
          .filter((d) => weekdays.includes(d.value))
          .map((d) => d.label)
          .join(', ')

  if (picking) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setPicking(false)}
          className="mb-1 inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:min-h-0 sm:py-1"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('newShift.pickTemplate')}
        </button>
        {/* Dài ra theo số mẫu cho tới khi cả khung menu chạm 40% chiều cao màn
            hình, quá nữa thì cuộn trong danh sách. 3rem = nút "Chọn ca mẫu"
            phía trên + lề của khung. */}
        <ul
          data-tour="new-shift-templates"
          className="max-h-[calc(40dvh-3rem)] space-y-1 overflow-y-auto overscroll-contain"
        >
          {active.map((tpl) => {
            const color = templateColor(tpl)
            return (
              <li key={tpl.id}>
                <button
                  type="button"
                  role="menuitem"
                  data-tour="new-shift-template-item"
                  onClick={() => onTemplate(tpl)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100"
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {tpl.title}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatRange(tpl.start_time, tpl.end_time)} · {repeatLabel(tpl.weekdays)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  const noTemplates = !templatesAvailable || active.length === 0
  const templateHint = !templatesAvailable
    ? t('newShift.notInstalled')
    : active.length === 0
      ? canManage
        ? t('newShift.noTemplatesAdmin')
        : t('newShift.noTemplates')
      : t('newShift.fromTemplateHint')

  return (
    <div className="space-y-1">
      <Option
        icon={Layers}
        tone="bg-indigo-50 text-indigo-600"
        tour="new-shift-from-template"
        label={t('newShift.fromTemplate')}
        hint={templateHint}
        disabled={noTemplates}
        trailing
        onClick={() => setPicking(true)}
      />
      <Option
        icon={PenLine}
        tone="bg-slate-100 text-slate-600"
        tour="new-shift-manual"
        label={t('newShift.manual')}
        hint={t('newShift.manualHint')}
        onClick={onManual}
      />
      {/* Quản lý ca mẫu chuyển về đây từ thanh ca mẫu cũ trên trang Lịch. */}
      {canManage && (
        <div className="border-t border-slate-100 pt-1">
          <Option
            icon={Settings2}
            tone="bg-teal-50 text-teal-600"
            tour="new-shift-manage"
            label={t('tpl.manage')}
            hint={t('newShift.manageHint')}
            onClick={onManage}
          />
        </div>
      )}
    </div>
  )
}

function Option({
  icon: Icon,
  tone,
  label,
  hint,
  disabled,
  trailing,
  tour,
  onClick,
}: {
  icon: typeof Plus
  /** Nền + màu icon, viết nguyên chuỗi để Tailwind sinh. */
  tone: string
  label: string
  hint: string
  disabled?: boolean
  /** Có mũi tên ›: bấm vào là sang bước chọn tiếp, chưa làm gì ngay. */
  trailing?: boolean
  /** Mốc cho wizard hướng dẫn (`data-tour`). */
  tour?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-tour={tour}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
      {trailing && !disabled && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
    </button>
  )
}

/**
 * Nút Tạo ca trên header PC: bấm là xổ menu hai lựa chọn ngay dưới nút.
 * Cùng kiểu đóng / mở với nút lưới (bấm ra ngoài, Esc, hiệu ứng menu-panel).
 */
export function NewShiftButton({
  onManual,
  onTemplate,
  onManage,
}: {
  onManual: () => void
  onTemplate: (template: ShiftTemplate) => void
  onManage: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element
      if (target.closest?.('[data-tour-overlay]')) return
      if (!ref.current?.contains(target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        data-tour="new-shift"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-500"
      >
        <Plus className="h-4 w-4" />
        {t('nav.newShift')}
        <ChevronDown
          className={`-mr-0.5 h-3.5 w-3.5 opacity-80 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <NewShiftPanel label={t('nav.newShift')}>
          <NewShiftChooser
            onManual={() => {
              setOpen(false)
              onManual()
            }}
            onTemplate={(tpl) => {
              setOpen(false)
              onTemplate(tpl)
            }}
            onManage={() => {
              setOpen(false)
              onManage()
            }}
          />
        </NewShiftPanel>
      )}
    </div>
  )
}

function NewShiftPanel({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useExitAnimation(ref, 200, { freezePosition: true })
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-tour="new-shift-menu"
      className="menu-panel absolute top-full right-0 z-50 mt-2 w-80 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-900/10"
    >
      {children}
    </div>
  )
}
