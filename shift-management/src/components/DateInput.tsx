import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { addDays, addMonths, addYears } from 'date-fns'
import { CalendarDays, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { formatDateText, maskDateText, parseDateText } from '../lib/dateText'
import { fromDateKey, toDateKey } from '../lib/time'
import { Calendar } from './Calendar'
import { placePopover, type Placement } from './popoverPlacement'
import { useExitAnimation } from './useExitAnimation'

/** Cỡ bảng lịch (w-[17.5rem] + đệm, 6 hàng ngày + đầu + chân). */
const PANEL_W = 296
const PANEL_H = 360

/**
 * Ô chọn ngày, thay cho `<input type="date">`: bảng chọn của trình duyệt mỗi
 * nơi một kiểu, không theo chế độ tối và không theo tuần bắt đầu thứ Hai.
 *
 * Vẫn gõ phím như ô gốc: `dd/MM/yyyy`, dấu `/` tự chèn (lib/dateText.ts), ↑ ↓
 * tăng giảm phần ngày / tháng / năm ở chỗ con trỏ. Chỉ khi gõ đủ một ngày có
 * thật (và trong `min` / `max`) mới báo `onChange` — không phát giá trị dở
 * dang như năm 0002. Rời ô khi đang gõ dở thì trả lại ngày cũ.
 *
 * Nút lịch bên phải (hoặc Alt + ↓) mở lịch trong một bảng nổi vẽ vào
 * `document.body` như Select, không bị khung cuộn của hộp thoại cắt.
 *
 * `clearable`: nút xoá trên ô và trong bảng — cho bộ lọc, nơi "không chọn
 * ngày" là một giá trị thật. `value` rỗng nghĩa là chưa chọn.
 *
 * `className` là lớp của ô — truyền đúng lớp của các ô nhập bên cạnh. Lớp
 * `focus:` của ô nhập được dựng lại bằng `has-[input:focus]`, vì thứ nhận
 * tiêu điểm là ô gõ bên trong.
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  disabled = false,
  clearable = false,
  className = '',
  'aria-describedby': describedBy,
}: {
  id?: string
  value: string
  onChange: (date: string) => void
  min?: string | null
  max?: string | null
  disabled?: boolean
  clearable?: boolean
  className?: string
  'aria-describedby'?: string
}) {
  const { t } = useI18n()
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  /** Chữ đang gõ dở; `null` = đang hiện đúng `value`. */
  const [draft, setDraft] = useState<string | null>(null)
  const open = placement !== null

  const inRange = (key: string) => !(min && key < min) && !(max && key > max)
  const text = draft ?? formatDateText(value)
  // Gõ đủ mà không nhận (ngày không có thật / ngoài khoảng): tô đỏ chữ.
  const invalid = draft !== null && draft.length === 10 && !accepted(draft)

  function accepted(s: string): string | null {
    const key = parseDateText(s)
    return key && inRange(key) ? key : null
  }

  function show() {
    if (disabled || !boxRef.current) return
    setPlacement(placePopover(boxRef.current, PANEL_H, PANEL_W))
  }

  function close() {
    setPlacement(null)
    inputRef.current?.focus()
  }

  function pick(date: string) {
    setPlacement(null)
    setDraft(null)
    inputRef.current?.focus()
    if (date !== value) onChange(date)
  }

  function onType(raw: string) {
    const next = maskDateText(raw)
    setDraft(next)
    if (next === '' && clearable) {
      if (value) onChange('')
      return
    }
    const key = accepted(next)
    if (key && key !== value) onChange(key)
  }

  /** ↑ ↓: tăng giảm phần đang đứng con trỏ, như ô ngày gốc. */
  function step(e: KeyboardEvent<HTMLInputElement>, dir: 1 | -1) {
    const base = accepted(text) ?? (value || toDateKey(new Date()))
    const caret = e.currentTarget.selectionStart ?? 0
    const d = fromDateKey(base)
    const next = toDateKey(
      caret <= 2 ? addDays(d, dir) : caret <= 5 ? addMonths(d, dir) : addYears(d, dir),
    )
    if (!inRange(next)) return
    setDraft(null)
    onChange(next)
    // Giữ con trỏ ở phần đang chỉnh sau khi ô vẽ lại.
    const input = e.currentTarget
    requestAnimationFrame(() => input.setSelectionRange(caret, caret))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.altKey && e.key === 'ArrowDown') || e.key === 'F4') {
      e.preventDefault()
      show()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      step(e, e.key === 'ArrowUp' ? 1 : -1)
    } else if (e.key === 'Enter' && draft !== null) {
      // Enter khi đang gõ dở: chốt lại (đúng thì đã lưu, sai thì trả về cũ).
      setDraft(null)
    }
  }

  // Bấm ra ngoài thì đóng lịch.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (boxRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setPlacement(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Ô bị khoá trong lúc đang mở (ví dụ có người vừa điểm danh).
  if (disabled && open) setPlacement(null)

  return (
    <>
      <div
        ref={boxRef}
        className={`${className} flex items-center gap-1.5 has-[input:focus]:border-indigo-500 has-[input:focus]:ring-2 has-[input:focus]:ring-indigo-500/20`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('date.placeholder')}
          value={text}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(e) => onType(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setDraft(null)}
          className={`min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-slate-400 disabled:cursor-not-allowed ${
            invalid ? 'text-rose-600' : ''
          }`}
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={() => {
              setDraft(null)
              onChange('')
            }}
            aria-label={t('date.clear')}
            title={t('date.clear')}
            tabIndex={-1}
            className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:h-6 sm:w-6"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => (open ? setPlacement(null) : show())}
          disabled={disabled}
          aria-label={t('date.pick')}
          aria-haspopup="dialog"
          aria-expanded={open}
          // Không nhận Tab: Tab vào thẳng ô gõ; mở lịch bằng Alt + ↓.
          tabIndex={-1}
          className="-my-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none sm:h-6 sm:w-6"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>

      {placement &&
        createPortal(
          <DatePanel
            panelRef={panelRef}
            anchorRef={boxRef}
            pos={placement}
            onReposition={setPlacement}
            value={value}
            min={min}
            max={max}
            clearable={clearable}
            onPick={pick}
            onClose={close}
          />,
          document.body,
        )}
    </>
  )
}

function DatePanel({
  panelRef,
  anchorRef,
  pos,
  onReposition,
  value,
  min,
  max,
  clearable,
  onPick,
  onClose,
}: {
  panelRef: RefObject<HTMLDivElement | null>
  anchorRef: RefObject<HTMLDivElement | null>
  pos: Placement
  onReposition: (pos: Placement) => void
  value: string
  min?: string | null
  max?: string | null
  clearable: boolean
  onPick: (date: string) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  useExitAnimation(panelRef, 140)

  // Bám theo ô khi cuộn (cả khung cuộn trong hộp thoại) và khi đổi cỡ cửa sổ.
  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        onReposition(placePopover(anchor, PANEL_H, PANEL_W)),
      )
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, onReposition])

  const today = toDateKey(new Date())
  const todayAllowed = !(min && today < min) && !(max && today > max)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t('date.pick')}
      onKeyDown={(e) => {
        // Chỉ đóng lịch, không để Esc lan lên đóng luôn hộp thoại bọc ngoài.
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
      className={`select-panel fixed z-[65] rounded-xl bg-white p-2 shadow-lg ring-1 ring-slate-900/10 ${
        pos.up ? 'is-up' : ''
      }`}
    >
      <Calendar value={value} onChange={onPick} min={min} max={max} autoFocus />
      <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5">
        <button
          type="button"
          onClick={() => onPick(today)}
          disabled={!todayAllowed}
          className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-40"
        >
          {t('list.today')}
        </button>
        {clearable && value && (
          <button
            type="button"
            onClick={() => onPick('')}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            {t('date.clear')}
          </button>
        )}
      </div>
    </div>
  )
}
