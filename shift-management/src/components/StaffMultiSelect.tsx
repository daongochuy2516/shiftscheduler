import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { Profile, UUID } from '../types'
import { useI18n } from '../i18n/I18nContext'
import { Avatar } from './Avatar'

/**
 * Ô chọn nhiều nhân viên cho bộ lọc trang Nhật ký. Nhìn như một ô select
 * thường; mở ra là danh sách bật/tắt từng người, không tự đóng sau mỗi lần
 * chọn để chọn liền nhiều người.
 */
export function StaffMultiSelect({
  id,
  className = '',
  profiles,
  value,
  onChange,
}: {
  id?: string
  /** Lớp của ô, để khớp với các ô khác trong cùng bộ lọc. */
  className?: string
  profiles: Profile[]
  value: UUID[]
  onChange: (value: UUID[]) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Bấm ra ngoài hoặc Esc thì đóng, như mọi menu thả xuống.
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const names = value.map(
    (uid) =>
      profiles.find((p) => p.id === uid)?.display_name ??
      t('common.unknownStaff'),
  )
  // Hai người thì ghi tên, nhiều hơn thì đếm — ô hẹp không chứa nổi cả dãy tên.
  const summary =
    value.length === 0
      ? t('log.allStaff')
      : value.length <= 2
        ? names.join(' + ')
        : t('log.staffCount', { count: value.length })

  function toggle(uid: UUID) {
    onChange(
      value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid],
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex items-center gap-2 text-left`}
      >
        {/* Cùng màu chữ và mũi tên với các ô select gốc bên cạnh: "Tất cả
            nhân viên" là một giá trị thật, không phải chữ gợi ý mờ. */}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronDown className="-mr-1.5 h-3.5 w-3.5 shrink-0 text-slate-900" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('log.staff')}
          className="absolute right-0 left-0 z-30 mt-1 min-w-56 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-slate-900/10"
        >
          <p className="px-2 pt-1 pb-1.5 text-xs text-slate-500">
            {t('log.staffAndHint')}
          </p>
          <div className="max-h-64 overflow-y-auto">
            {profiles.map((p) => {
              const selected = value.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggle(p.id)}
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
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-indigo-600 transition hover:bg-slate-100"
            >
              {t('log.staffClear')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
