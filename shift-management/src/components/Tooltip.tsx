import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Rê chuột vào rồi dừng chừng này mới hiện — gần với tooltip của hệ điều hành. */
const SHOW_DELAY_MS = 500
/**
 * Vừa tắt một tooltip mà rê sang phần tử khác trong khoảng này thì hiện ngay,
 * như Windows / macOS: lướt dọc một hàng nút không phải chờ lại từng cái.
 */
const WARM_MS = 400
/** Khoảng cách tooltip với phần tử, và với mép màn hình. */
const GAP = 6
const MARGIN = 8

interface Tip {
  anchor: HTMLElement
  text: string
  /** Tăng mỗi lần hiện, làm `key` để hiệu ứng xổ ra chạy lại khi đổi phần tử. */
  seq: number
}

function tipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null
  const el = node.closest<HTMLElement>('[data-tooltip]')
  return el && el.dataset.tooltip ? el : null
}

/**
 * Tooltip tự vẽ cho toàn app, thay cho `title` của trình duyệt (hiện chậm,
 * không theo chế độ tối, mỗi trình duyệt một kiểu).
 *
 * Phần tử nào cần tooltip thì gắn `data-tooltip="…"` — **không dùng `title`**.
 * Lớp này gắn một lần ở gốc app, nghe sự kiện ở `document` nên phần tử thêm
 * sau (modal, danh sách tải thêm) cũng có tooltip mà không cần bọc component.
 * Chữ có `\n` thì xuống dòng.
 *
 * Như tooltip của hệ điều hành: không hiện khi chạm (điện thoại), bấm vào là
 * tắt và không hiện lại cho tới khi chuột rời phần tử đó, cuộn trang hay Esc
 * cũng tắt. Tab tới bằng bàn phím thì hiện ngay.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const id = useId()

  /** Bản sao của `tip` cho các handler gắn một lần. */
  const shown = useRef<Tip | null>(null)
  const pending = useRef<{ anchor: HTMLElement; timer: number } | null>(null)
  const hiddenAt = useRef(0)
  /** Phần tử vừa bị bấm: không hiện lại cho tới khi chuột rời nó. */
  const suppressed = useRef<HTMLElement | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    function cancelPending() {
      if (pending.current) window.clearTimeout(pending.current.timer)
      pending.current = null
    }
    function show(anchor: HTMLElement) {
      cancelPending()
      const text = anchor.dataset.tooltip
      if (!text || !anchor.isConnected) return
      seq.current += 1
      const next = { anchor, text, seq: seq.current }
      shown.current = next
      setTip(next)
    }
    function hide() {
      cancelPending()
      if (!shown.current) return
      shown.current = null
      hiddenAt.current = Date.now()
      setTip(null)
    }
    function schedule(anchor: HTMLElement) {
      if (shown.current?.anchor === anchor || pending.current?.anchor === anchor) {
        return
      }
      const warm =
        shown.current !== null || Date.now() - hiddenAt.current < WARM_MS
      if (warm) {
        show(anchor)
        return
      }
      cancelPending()
      pending.current = {
        anchor,
        timer: window.setTimeout(() => show(anchor), SHOW_DELAY_MS),
      }
    }

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const anchor = tipTarget(e.target)
      if (anchor !== suppressed.current) suppressed.current = null
      if (!anchor) {
        hide()
        return
      }
      if (anchor === suppressed.current) return
      schedule(anchor)
    }
    const onOut = (e: PointerEvent) => {
      // Ra khỏi cửa sổ trình duyệt: không có pointerover nào tiếp theo.
      if (!e.relatedTarget) {
        suppressed.current = null
        hide()
      }
    }
    const onDown = (e: PointerEvent) => {
      suppressed.current = tipTarget(e.target)
      hide()
    }
    const onFocusIn = (e: FocusEvent) => {
      const anchor = tipTarget(e.target)
      // Chỉ khi tới bằng bàn phím — bấm chuột cũng làm phần tử nhận focus.
      if (anchor && anchor.matches(':focus-visible')) show(anchor)
    }
    const onFocusOut = (e: FocusEvent) => {
      if (shown.current && shown.current.anchor === e.target) hide()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }

    document.addEventListener('pointerover', onOver, true)
    document.addEventListener('pointerout', onOut, true)
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKey, true)
    // Cuộn bất cứ khung nào (capture) hay đổi cỡ cửa sổ: vị trí đã sai, tắt.
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      cancelPending()
      document.removeEventListener('pointerover', onOver, true)
      document.removeEventListener('pointerout', onOut, true)
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])

  // Theo phần tử đang có tooltip: chữ đổi thì cập nhật (ô Giao diện trong nút
  // lưới đổi "Chuyển sang …" sau mỗi lần bấm), phần tử bị gỡ khỏi trang
  // (đóng hộp thoại) thì tắt — lúc đó không còn pointerout nào để báo.
  useEffect(() => {
    if (!tip) return
    const { anchor } = tip
    const sync = () => {
      const text = anchor.dataset.tooltip
      if (!anchor.isConnected || !text) {
        shown.current = null
        hiddenAt.current = Date.now()
        setTip(null)
      } else if (text !== shown.current?.text) {
        const next = { ...tip, text }
        shown.current = next
        setTip(next)
      }
    }
    const observer = new MutationObserver(sync)
    observer.observe(anchor, { attributes: true, attributeFilter: ['data-tooltip'] })
    const poll = window.setInterval(sync, 300)

    // Trình đọc màn hình đọc tooltip như mô tả của phần tử, như `title` cũ.
    // React không quản thuộc tính này trên các phần tử đó nên gắn tay được.
    const describes = !anchor.hasAttribute('aria-describedby')
    if (describes) anchor.setAttribute('aria-describedby', id)
    return () => {
      observer.disconnect()
      window.clearInterval(poll)
      if (describes) anchor.removeAttribute('aria-describedby')
    }
  }, [tip, id])

  // Đặt chỗ trước khi trình duyệt vẽ: dưới phần tử, canh giữa; sát đáy màn
  // hình thì lên trên. Không bao giờ tràn ra ngoài mép.
  useLayoutEffect(() => {
    const el = tipRef.current
    if (!tip || !el) return
    balanceWidth(el)
    hideLineEndDots(el)
    const r = tip.anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.min(
      Math.max(MARGIN, r.left + r.width / 2 - w / 2),
      window.innerWidth - w - MARGIN,
    )
    let top = r.bottom + GAP
    const up = top + h > window.innerHeight - MARGIN
    if (up) top = Math.max(MARGIN, r.top - GAP - h)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.classList.toggle('is-up', up)
    el.style.visibility = 'visible'
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      key={tip.seq}
      ref={tipRef}
      id={id}
      role="tooltip"
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="hover-tip pointer-events-none fixed z-[80] max-w-xs rounded-lg bg-white px-2.5 py-1.5 text-xs leading-snug font-medium text-slate-700 shadow-lg ring-1 ring-slate-900/10"
    >
      <TipText text={tip.text} />
    </div>,
    document.body,
  )
}

/**
 * Chữ phải xuống dòng thì chia đều các dòng (2 / 2 chứ không 3 / 1): thu hẹp
 * bề ngang tới mức nhỏ nhất mà số dòng vẫn như cũ. Được luôn cái khung ôm sát
 * chữ — để trình duyệt tự ngắt thì khung giữ nguyên bề rộng tối đa, dòng ngắn
 * thừa một khoảng trống bên phải. (`text-wrap: balance` của CSS chia đều
 * nhưng không thu khung lại.)
 *
 * Tìm nhị phân trên bề ngang, mỗi bước một lần đo chiều cao: khoảng chục
 * lần reflow trên một phần tử nhỏ, chỉ chạy lúc tooltip hiện.
 */
function balanceWidth(el: HTMLElement) {
  el.style.width = ''
  const full = el.offsetWidth
  const height = el.offsetHeight
  // Một dòng: không có gì để chia.
  el.style.whiteSpace = 'nowrap'
  const oneLine = el.offsetHeight
  el.style.whiteSpace = ''
  if (height <= oneLine) return

  let lo = 0
  let hi = full
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    el.style.width = `${mid}px`
    if (el.offsetHeight > height) lo = mid
    else hi = mid
  }
  el.style.width = `${hi}px`
}

/**
 * Cụm cuối một dòng thì dấu `·` sau nó thừa — dòng dưới đã là cụm mới. Ẩn
 * bằng `visibility` chứ không gỡ: gỡ đi thì dòng trên ngắn lại, cụm đầu dòng
 * dưới có thể nhảy lên và lại thiếu dấu ở giữa dòng.
 *
 * Cụm nằm trên dòng mới khi mép trên của nó thấp hơn mép dưới của cụm trước
 * (so mép dưới chứ không mép trên, vì cụm dài có thể tự gãy thành hai dòng).
 */
function hideLineEndDots(el: HTMLElement) {
  const parts = el.querySelectorAll<HTMLElement>('[data-tip-part]')
  parts.forEach((part, i) => {
    const dot = part.querySelector<HTMLElement>('[data-tip-dot]')
    if (!dot) return
    const next = parts[i + 1]
    const wraps = !!next && next.offsetTop >= part.offsetTop + part.offsetHeight - 1
    dot.style.visibility = wraps ? 'hidden' : ''
  })
}

/** Dấu ngăn các cụm trong một tooltip: `Trực trang · Huy · 08:00–12:00`. */
const SEPARATOR = ' · '

/**
 * Xuống dòng theo cụm chứ không theo từng chữ: "Chờ xác nhận" không bị gãy
 * thành "Chờ / xác nhận" — hết chỗ thì cả cụm xuống dòng.
 *
 * Mỗi cụm là một `inline-block`: trình duyệt coi nó như một chữ lớn, chỉ
 * ngắt ở khoảng trắng giữa các cụm. Cụm dài hơn cả bề ngang tooltip (tên ca
 * dài, câu báo lỗi) thì `max-w-full` cho nó tự gãy bên trong như chữ thường.
 * Dấu `·` dính vào cuối cụm trước để dòng mới không bắt đầu bằng dấu chấm.
 * `\n` vẫn là xuống dòng cứng.
 */
function TipText({ text }: { text: string }) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(SEPARATOR)
    return (
      <div key={i}>
        {parts.map((part, j) => (
          <span key={j}>
            <span data-tip-part className="inline-block max-w-full">
              {part}
              {j < parts.length - 1 && <span data-tip-dot> ·</span>}
            </span>
            {j < parts.length - 1 && ' '}
          </span>
        ))}
      </div>
    )
  })
}
