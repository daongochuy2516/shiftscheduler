import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useExitAnimation } from './useExitAnimation'

export interface SelectOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
  /** Vẽ trước nhãn, cả trong danh sách lẫn trên ô (ví dụ avatar). */
  icon?: ReactNode
}

/** Gõ chữ liên tiếp trong ngần này thì ghép thành một cụm để nhảy tới. */
const TYPEAHEAD_MS = 600
/** Danh sách cao tối đa (max-h-64) — để quyết định mở xuống hay mở lên. */
const PANEL_MAX_H = 256
const GAP = 4

/** So chữ không dấu, không phân biệt hoa thường: gõ "ngu" ra "Nguyễn". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

interface Placement {
  left: number
  width: number
  top?: number
  bottom?: number
  up: boolean
}

function place(trigger: HTMLElement): Placement {
  const r = trigger.getBoundingClientRect()
  const vh = window.innerHeight
  const below = vh - r.bottom - GAP
  // Mở lên chỉ khi phía dưới chật mà phía trên rộng hơn — như select gốc.
  const up = below < Math.min(PANEL_MAX_H, 160) && r.top > below
  return up
    ? { left: r.left, width: r.width, bottom: vh - r.top + GAP, up }
    : { left: r.left, width: r.width, top: r.bottom + GAP, up }
}

/**
 * Ô chọn một giá trị, thay cho `<select>` gốc: danh sách của trình duyệt mỗi
 * nơi một kiểu, không theo chế độ tối, không có hiệu ứng, và không vẽ được
 * avatar trong từng dòng.
 *
 * - Danh sách vẽ vào `document.body` (portal) và đặt `fixed` theo ô, nên không
 *   bị khung cuộn của hộp thoại cắt mất; cuộn hay đổi cỡ cửa sổ thì bám theo.
 * - Tiêu điểm luôn ở trên ô (`aria-activedescendant`): bàn phím chỉ cần xử lý
 *   ở một chỗ, và hộp thoại bọc ngoài không mất tiêu điểm khi bấm vào danh sách.
 * - Phím như select gốc: ↑ ↓ Home End để đi, Enter / Space để chọn, Esc / Tab
 *   để đóng, gõ chữ để nhảy tới dòng bắt đầu bằng chữ đó.
 *
 * `className` là lớp của ô — truyền đúng lớp của các ô nhập bên cạnh để khớp.
 */
export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: {
  id?: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
  'aria-label'?: string
}) {
  const listId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  /** Đo lúc bấm mở (trong event handler) để danh sách vẽ đúng chỗ ngay khung đầu. */
  const [placement, setPlacement] = useState<Placement | null>(null)
  const typed = useRef({ text: '', at: 0 })

  const selectedIndex = options.findIndex((o) => o.value === value)
  const selected = options[selectedIndex]

  function show() {
    if (disabled || !triggerRef.current) return
    setPlacement(place(triggerRef.current))
    setActive(selectedIndex >= 0 ? selectedIndex : firstEnabled(1, -1))
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    setOpen(false)
    if (option.value !== value) onChange(option.value)
  }

  /** Dòng bấm được kế tiếp theo hướng `step`, bỏ qua dòng bị khoá. */
  function firstEnabled(step: 1 | -1, from: number): number {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i
    }
    return from
  }

  function jumpTo(key: string) {
    const now = Date.now()
    const state = typed.current
    state.text = now - state.at > TYPEAHEAD_MS ? key : state.text + key
    state.at = now
    const needle = fold(state.text)
    // Bắt đầu tìm từ dòng sau dòng hiện tại: gõ cùng một chữ nhiều lần thì
    // lần lượt qua từng người có tên bắt đầu bằng chữ đó.
    const base = open ? active : selectedIndex
    const start = state.text.length === 1 ? base + 1 : Math.max(base, 0)
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length
      const o = options[i]
      if (!o.disabled && fold(o.label).startsWith(needle)) {
        if (open) setActive(i)
        else choose(i)
        return
      }
    }
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        show()
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        jumpTo(e.key)
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => firstEnabled(1, i))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => firstEnabled(-1, i))
        break
      case 'Home':
        e.preventDefault()
        setActive(firstEnabled(1, -1))
        break
      case 'End':
        e.preventDefault()
        setActive(firstEnabled(-1, options.length))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        // Chỉ đóng danh sách, không để Esc lan lên đóng luôn hộp thoại bọc ngoài.
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          jumpTo(e.key)
        }
    }
  }

  // Bấm ra ngoài thì đóng.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Ô bị khoá trong lúc đang mở (ví dụ lưu xong form chuyển sang chỉ đọc).
  if (disabled && open) setOpen(false)

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={`${className} flex items-center gap-2 text-left`}
      >
        {selected?.icon}
        {/* Mọi nhãn chồng lên nhau trong cùng một ô lưới, chỉ nhãn đang chọn
            hiện ra: ô tự rộng bằng nhãn dài nhất như select gốc, nên đổi lựa
            chọn không làm ô co giãn. Ô bị bó hẹp thì cắt chữ bằng dấu "…". */}
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)]">
          {options.map((o) => (
            <span
              key={o.value}
              aria-hidden={o.value !== value}
              className={`col-start-1 row-start-1 truncate ${
                o.value === value ? '' : 'invisible'
              }`}
            >
              {o.label}
            </span>
          ))}
        </span>
        <ChevronDown
          className={`-mr-1 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        placement &&
        createPortal(
          <SelectPanel
            id={listId}
            panelRef={panelRef}
            triggerRef={triggerRef}
            pos={placement}
            onReposition={setPlacement}
            label={ariaLabel}
            options={options}
            value={value}
            active={active}
            onHover={setActive}
            onChoose={choose}
          />,
          document.body,
        )}
    </>
  )
}

function SelectPanel<T extends string>({
  id,
  panelRef,
  triggerRef,
  pos,
  onReposition,
  label,
  options,
  value,
  active,
  onHover,
  onChoose,
}: {
  id: string
  panelRef: RefObject<HTMLDivElement | null>
  triggerRef: RefObject<HTMLButtonElement | null>
  pos: Placement
  onReposition: (pos: Placement) => void
  label?: string
  options: SelectOption<T>[]
  value: T
  active: number
  onHover: (index: number) => void
  onChoose: (index: number) => void
}) {
  useExitAnimation(panelRef, 140)

  // Bám theo ô khi cuộn (cả khung cuộn trong hộp thoại — nên nghe ở pha
  // capture) và khi đổi cỡ cửa sổ.
  useEffect(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => onReposition(place(trigger)))
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [triggerRef, onReposition])

  // Dòng đang trỏ luôn nằm trong khung nhìn khi đi bằng phím.
  useEffect(() => {
    const el = document.getElementById(`${id}-${active}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [id, active])

  return (
    <div
      ref={panelRef}
      id={id}
      role="listbox"
      aria-label={label}
      // Giữ tiêu điểm trên ô: bấm vào danh sách không làm ô (và hộp thoại
      // bọc ngoài) mất tiêu điểm.
      onMouseDown={(e) => e.preventDefault()}
      style={{
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        minWidth: pos.width,
      }}
      className={`select-panel fixed z-[65] max-h-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-white p-1 shadow-lg ring-1 ring-slate-900/10 ${
        pos.up ? 'is-up' : ''
      }`}
    >
      {options.map((o, i) => {
        const isSelected = o.value === value
        return (
          <div
            key={o.value}
            id={`${id}-${i}`}
            role="option"
            aria-selected={isSelected}
            aria-disabled={o.disabled || undefined}
            onPointerMove={() => {
              if (!o.disabled && i !== active) onHover(i)
            }}
            onClick={() => onChoose(i)}
            className={`flex min-h-11 items-center gap-2 rounded-md px-2.5 text-base whitespace-nowrap sm:min-h-8 sm:text-sm ${
              o.disabled
                ? 'cursor-not-allowed text-slate-300'
                : `cursor-pointer ${
                    i === active ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                  }`
            } ${isSelected && !o.disabled ? 'font-medium text-indigo-700' : ''}`}
          >
            {o.icon}
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            <Check
              className={`h-4 w-4 shrink-0 ${
                isSelected ? 'text-indigo-600' : 'invisible'
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}
