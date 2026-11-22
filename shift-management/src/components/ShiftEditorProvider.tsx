import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { isValid } from 'date-fns'
import { Loader2 } from 'lucide-react'
import type { ShiftWithAssignments, UUID } from '../types'
import { fromDateKey, toDateKey } from '../lib/time'
import { dateParam, useOverlayParams } from '../lib/urlParams'
import { isNetworkError } from '../lib/network'
import { isRecordId } from '../data'
import { useSchedule } from '../data/ScheduleContext'
import { useI18n } from '../i18n/I18nContext'
import { useNotify } from '../notifications/NotificationContext'
import { Modal } from './Modal'
import { ShiftModal, type EditorMode } from './ShiftModal'

interface ShiftEditorValue {
  /** Opens the modal in create mode, optionally pre-filling the date. */
  openCreate: (date?: string) => void
  /** Opens the modal in edit mode, optionally highlighting one assignment. */
  openEdit: (shift: ShiftWithAssignments, assignmentId?: UUID) => void
  /**
   * Như `openEdit` nhưng chỉ cần id (Nhật ký, Tổng kết…): ca lấy từ bộ đệm
   * nếu có, không thì hỏi máy chủ. Ca đã bị xoá → thông báo lỗi, không mở.
   */
  openEditById: (shiftId: UUID, assignmentId?: UUID) => void
}

const ShiftEditorContext = createContext<ShiftEditorValue | null>(null)

const MODE_STORAGE_KEY = 'scheduler.shiftEditorMode'

/** Mỗi người nhớ chế độ mình hay dùng; không đọc được thì mặc định Đơn giản. */
function readStoredMode(): EditorMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'advanced'
      ? 'advanced'
      : 'simple'
  } catch {
    return 'simple'
  }
}

function writeStoredMode(mode: EditorMode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Trình duyệt chặn lưu trữ: lần sau về mặc định, không sao.
  }
}

/** `yyyy-MM-dd` có thật (loại cả 2026-02-30), không thì `null`. */
function validDate(raw: string | null | undefined): string | null {
  const key = dateParam(raw ?? null)
  return key && isValid(fromDateKey(key)) ? key : null
}

/**
 * Form tạo / sửa ca dùng chung cho mọi trang.
 *
 * Địa chỉ trang là nơi giữ trạng thái (copy link gửi người khác là họ thấy
 * đúng form đó):
 * - `shift=<id>`: sửa ca đó; `shift=new` + `shiftDate=yyyy-MM-dd`: tạo ca.
 * - `assignment=<id>`: tô sáng một người trong ca.
 * - `shiftView=advanced`: chế độ Nâng cao (Đơn giản là mặc định → không ghi).
 *
 * `openEdit` / `openCreate` chỉ ghi tham số (thêm mục lịch sử, nên Back đóng
 * form); provider đọc URL rồi vẽ form. Ca lấy theo thứ tự: bản người gọi
 * `openEdit` đưa (chỉ cho đúng lần mở đó), bộ đệm, rồi hỏi máy chủ. Lấy được
 * rồi thì giữ nguyên bản đó tới khi đóng
 * — như trước đây — để dữ liệu làm tươi giữa chừng (Realtime, hay chính lần
 * lưu / xoá của form) không thay ca dưới tay người đang sửa.
 */
export function ShiftEditorProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const { params, open, close, set } = useOverlayParams()
  const { cachedShift, fetchShift } = useSchedule()
  const notify = useNotify()

  const shiftParam = params.get('shift')
  const assignmentParam = params.get('assignment')
  const shiftDateParam = params.get('shiftDate')
  const shiftViewParam = params.get('shiftView')

  const isCreate = shiftParam === 'new'
  const editId = shiftParam && !isCreate && isRecordId(shiftParam) ? shiftParam : null
  const badId = !!shiftParam && !isCreate && !editId

  // Ca người gọi `openEdit` đưa vào — dùng khi bộ đệm không có.
  const [passed, setPassed] = useState<ShiftWithAssignments | null>(null)
  // Bản ca form đang dùng, giữ cố định theo id (xem chú thích ở trên).
  const [held, setHeld] = useState<{ id: string; shift: ShiftWithAssignments } | null>(
    null,
  )

  let shift: ShiftWithAssignments | null = held && held.id === editId ? held.shift : null
  if (editId && !shift) {
    shift = (passed?.id === editId ? passed : null) ?? cachedShift(editId)
    // Trạng thái suy ra lúc vẽ (React cho phép, có điều kiện dừng): lần vẽ
    // sau `held` đã khớp id nên không đặt lại.
    if (shift) setHeld({ id: editId, shift })
  }
  if (!editId && held) setHeld(null)
  // Bản người gọi đưa chỉ dùng cho đúng lần mở nó đi kèm: form đã giữ ca đó
  // rồi thì bỏ. Quay lại mục lịch sử này sau (Back / Forward) phải lấy bộ
  // đệm hay hỏi máy chủ — ca có thể đã bị sửa / xoá trong lúc đó. (Không bỏ
  // khi `editId` còn trống: URL có thể tới sau setPassed một nhịp.)
  if (passed && editId === passed.id && held?.id === editId) setPassed(null)

  const mode: EditorMode = shiftViewParam === 'advanced' ? 'advanced' : 'simple'

  // Hàm mới nhất cho các hiệu ứng bất đồng bộ, khỏi đưa vào deps (đổi mỗi
  // lần URL đổi) mà chạy lại phép tải.
  const latest = useRef({ close, notify })
  useEffect(() => {
    latest.current = { close, notify }
  }, [close, notify])

  // Mỗi link hỏng chỉ báo một lần (StrictMode chạy hiệu ứng hai lần).
  const reportedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!shiftParam) reportedFor.current = null
  }, [shiftParam])

  /** Link hỏng / ca không còn: báo rồi gỡ tham số khỏi URL. */
  const reportGone = useCallback((id: string) => {
    if (reportedFor.current === id) return
    reportedFor.current = id
    latest.current.notify.notify({
      kind: 'error',
      title: 'notif.shift.openFailed',
      bodyKey: 'shift.linkGone',
    })
    latest.current.close()
  }, [])

  useEffect(() => {
    if (badId && shiftParam) reportGone(shiftParam)
  }, [badId, shiftParam, reportGone])

  const needFetch = editId !== null && shift === null
  useEffect(() => {
    if (!needFetch || !editId) return
    let cancelled = false
    fetchShift(editId).then(
      (found) => {
        if (cancelled) return
        if (found) setHeld({ id: editId, shift: found })
        else reportGone(editId)
      },
      (err: unknown) => {
        if (cancelled) return
        // Câu mạng mặc định của useNotify nói về phép ghi ("chưa gửi gì
        // đi"); đây là phép đọc không có bản lưu trên máy.
        if (isNetworkError(err)) {
          latest.current.notify.notify({
            kind: 'error',
            title: 'notif.shift.openFailed',
            bodyKey: 'offline.noCache',
          })
        } else {
          latest.current.notify.error('notif.shift.openFailed', err)
        }
        latest.current.close()
      },
    )
    return () => {
      cancelled = true
    }
  }, [needFetch, editId, fetchShift, reportGone])

  /**
   * Chuẩn hoá URL cho khớp với cái đang hiện (thay, không thêm lịch sử):
   * tham số lạc không có `shift`, ngày tạo ca hỏng → hôm nay, `shiftView`
   * lạ, `assignment` không thuộc ca.
   */
  const highlightValid =
    !assignmentParam ||
    (isRecordId(assignmentParam) &&
      (!shift || shift.assignments.some((a) => a.id === assignmentParam)))
  useEffect(() => {
    const fix: Record<string, string | null> = {}
    if (!shiftParam) {
      if (assignmentParam !== null) fix.assignment = null
      if (shiftDateParam !== null) fix.shiftDate = null
      if (shiftViewParam !== null) fix.shiftView = null
    } else if (shiftParam === 'new') {
      if (assignmentParam !== null) fix.assignment = null
      if (shiftViewParam !== null) fix.shiftView = null
      if (validDate(shiftDateParam) !== shiftDateParam) {
        fix.shiftDate = toDateKey(new Date())
      }
    } else if (editId) {
      if (shiftDateParam !== null) fix.shiftDate = null
      if (shiftViewParam !== null && shiftViewParam !== 'advanced') fix.shiftView = null
      if (!highlightValid) fix.assignment = null
    }
    if (Object.keys(fix).length > 0) set(fix)
  }, [
    shiftParam,
    editId,
    assignmentParam,
    shiftDateParam,
    shiftViewParam,
    highlightValid,
    set,
  ])

  const openCreate = useCallback(
    (date?: string) => {
      open({ shift: 'new', shiftDate: validDate(date) ?? toDateKey(new Date()) })
    },
    [open],
  )

  const openEditById = useCallback(
    (shiftId: UUID, assignmentId?: UUID) => {
      // Mở từ giao diện: dùng chế độ người này hay dùng. Link dán thì
      // `shiftView` trên link quyết định.
      open({
        shift: shiftId,
        assignment: assignmentId ?? null,
        shiftView: readStoredMode() === 'advanced' ? 'advanced' : null,
      })
    },
    [open],
  )

  const openEdit = useCallback(
    (target: ShiftWithAssignments, assignmentId?: UUID) => {
      setPassed(target)
      openEditById(target.id, assignmentId)
    },
    [openEditById, setPassed],
  )

  const changeMode = useCallback(
    (next: EditorMode) => {
      writeStoredMode(next)
      set({ shiftView: next === 'advanced' ? 'advanced' : null })
    },
    [set],
  )

  const value = useMemo(
    () => ({ openCreate, openEdit, openEditById }),
    [openCreate, openEdit, openEditById],
  )

  const createDate = validDate(shiftDateParam) ?? toDateKey(new Date())

  return (
    <ShiftEditorContext.Provider value={value}>
      {children}
      {isCreate && (
        <ShiftModal
          key="new"
          shift={null}
          defaultDate={createDate}
          highlightAssignmentId={null}
          mode="simple"
          onModeChange={changeMode}
          onClose={close}
        />
      )}
      {editId && shift && (
        <ShiftModal
          key={shift.id}
          shift={shift}
          defaultDate={shift.date}
          highlightAssignmentId={highlightValid ? assignmentParam : null}
          mode={mode}
          onModeChange={changeMode}
          onClose={close}
        />
      )}
      {editId && !shift && (
        // Mở từ link / từ id: đang hỏi máy chủ. Đóng ở đây là bỏ luôn phép tải.
        <Modal title={t('shift.edit')} onClose={close} width="max-w-md">
          <div className="flex items-center justify-center gap-2.5 py-8 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            <span className="text-sm font-medium">{t('common.loading')}</span>
          </div>
        </Modal>
      )}
    </ShiftEditorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShiftEditor(): ShiftEditorValue {
  const ctx = useContext(ShiftEditorContext)
  if (!ctx)
    throw new Error('useShiftEditor must be used inside <ShiftEditorProvider>')
  return ctx
}
