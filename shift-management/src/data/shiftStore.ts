import type { ShiftQuery, ShiftWithAssignments } from '../types'

/**
 * Bộ đệm ca theo lát cắt.
 *
 * Trước đây ứng dụng tải **toàn bộ** ca một lần rồi mỗi trang tự lọc — dữ
 * liệu càng tích luỹ thì lần tải đầu càng nặng. Giờ mỗi màn hình xin đúng
 * phần nó hiển thị (một ngày, một tuần, một tháng, ca của một người, ca còn
 * chờ xác nhận) và bộ đệm này giữ từng phần theo khoá riêng.
 *
 * Luật làm tươi:
 * - Lát cắt đang có người xem mà dữ liệu đổi → tải lại ngay, **giữ dữ liệu
 *   cũ trên màn hình** trong lúc chờ, không nháy khung xương.
 * - Lát cắt không ai xem → bỏ luôn. Lần sau cần thì tải lại, tránh giữ dữ
 *   liệu cũ mà tưởng là mới.
 */

export interface ShiftQueryState {
  shifts: ShiftWithAssignments[]
  /** Đã có dữ liệu cho lát cắt này ít nhất một lần. */
  loaded: boolean
  /** Đang có yêu cầu tải chạy. */
  loading: boolean
  error: string | null
}

interface Entry {
  query: ShiftQuery
  state: ShiftQueryState
  listeners: Set<() => void>
  /** Mỗi lần tải tăng một: câu trả lời về muộn của lần cũ bị bỏ qua. */
  generation: number
  inflight: Promise<void> | null
  lastUsed: number
}

/** Số lát cắt không ai xem được giữ lại, để bấm lùi/tới vẫn tức thì. */
const MAX_IDLE = 12

const IDLE_STATE: ShiftQueryState = {
  shifts: [],
  loaded: false,
  loading: false,
  error: null,
}

export function shiftQueryKey(query: ShiftQuery): string {
  if (query.kind === 'user') return `user|${query.userId}`
  if (query.kind === 'pending') return 'pending'
  // Sắp xếp id để cùng một nhóm người luôn ra cùng một khoá, bất kể thứ tự chọn.
  const ids = [...(query.userIds ?? [])].sort().join('+')
  return `range|${query.from ?? ''}|${query.to ?? ''}|${ids}`
}

export function parseShiftQueryKey(key: string): ShiftQuery {
  const [kind, a = '', b = '', c = ''] = key.split('|')
  if (kind === 'user') return { kind: 'user', userId: a }
  if (kind === 'pending') return { kind: 'pending' }
  return {
    kind: 'range',
    from: a || null,
    to: b || null,
    userIds: c ? c.split('+') : [],
  }
}

export type ShiftStore = ReturnType<typeof createShiftStore>

/** Nối nhiều lát cắt thành một: bỏ trùng theo id, xếp theo ngày rồi giờ. */
function combine(states: ShiftQueryState[]): ShiftQueryState {
  const byId = new Map<string, ShiftWithAssignments>()
  for (const state of states) {
    for (const shift of state.shifts) byId.set(shift.id, shift)
  }
  const shifts = [...byId.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time),
  )
  return {
    shifts,
    loaded: states.every((s) => s.loaded),
    loading: states.some((s) => s.loading),
    error: states.find((s) => s.error)?.error ?? null,
  }
}

/** Số tổ hợp lát cắt được nhớ kết quả ghép. */
const MAX_COMBINED = 16

export function createShiftStore(
  fetchShifts: (query: ShiftQuery) => Promise<ShiftWithAssignments[]>,
) {
  const entries = new Map<string, Entry>()
  /**
   * Kết quả ghép được nhớ theo tổ hợp khoá, và chỉ tính lại khi một lát cắt
   * thành viên thật sự đổi — useSyncExternalStore đòi snapshot ổn định, trả
   * object mới mỗi lần gọi sẽ render vô hạn.
   */
  const combined = new Map<
    string,
    { members: ShiftQueryState[]; result: ShiftQueryState }
  >()

  function ensure(key: string): Entry {
    let entry = entries.get(key)
    if (!entry) {
      entry = {
        query: parseShiftQueryKey(key),
        state: IDLE_STATE,
        listeners: new Set(),
        generation: 0,
        inflight: null,
        lastUsed: Date.now(),
      }
      entries.set(key, entry)
    }
    return entry
  }

  /** Luôn thay object mới: useSyncExternalStore so sánh theo tham chiếu. */
  function update(entry: Entry, patch: Partial<ShiftQueryState>) {
    entry.state = { ...entry.state, ...patch }
    entry.listeners.forEach((fn) => fn())
  }

  function load(entry: Entry): Promise<void> {
    const generation = ++entry.generation
    update(entry, { loading: true })
    const run = fetchShifts(entry.query).then(
      (shifts) => {
        if (generation !== entry.generation) return
        update(entry, { shifts, loaded: true, loading: false, error: null })
      },
      (err: unknown) => {
        if (generation !== entry.generation) return
        update(entry, {
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load shifts.',
        })
      },
    )
    entry.inflight = run.finally(() => {
      if (generation === entry.generation) entry.inflight = null
    })
    return entry.inflight
  }

  function evictIdle() {
    const idle = [...entries.entries()]
      .filter(([, e]) => e.listeners.size === 0)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    for (const [key] of idle.slice(0, Math.max(0, idle.length - MAX_IDLE))) {
      entries.delete(key)
    }
  }

  return {
    getSnapshot(key: string): ShiftQueryState {
      return entries.get(key)?.state ?? IDLE_STATE
    },

    /** Snapshot ghép của nhiều lát cắt, khoá nối bằng dấu phẩy. */
    getCombinedSnapshot(keys: string[]): ShiftQueryState {
      const id = keys.join(',')
      const members = keys.map((k) => entries.get(k)?.state ?? IDLE_STATE)
      const cached = combined.get(id)
      if (
        cached &&
        cached.members.length === members.length &&
        cached.members.every((m, i) => m === members[i])
      ) {
        return cached.result
      }
      const result = combine(members)
      combined.delete(id)
      combined.set(id, { members, result })
      if (combined.size > MAX_COMBINED) {
        combined.delete(combined.keys().next().value as string)
      }
      return result
    },

    subscribe(key: string, listener: () => void): () => void {
      const entry = ensure(key)
      entry.listeners.add(listener)
      entry.lastUsed = Date.now()
      if (!entry.state.loaded && !entry.inflight) void load(entry)
      return () => {
        entry.listeners.delete(listener)
        entry.lastUsed = Date.now()
        evictIdle()
      }
    },

    /** Tải trước một lát cắt chưa ai xem, ví dụ tuần kế tiếp. */
    prefetch(key: string) {
      const entry = ensure(key)
      if (!entry.state.loaded && !entry.inflight) void load(entry)
      evictIdle()
    },

    /**
     * Dữ liệu vừa đổi. Lát cắt đang hiển thị tải lại, phần còn lại bị bỏ.
     * Promise xong khi các màn hình đang mở đã có dữ liệu mới — để form lưu
     * xong mới đóng, người dùng không thấy số cũ.
     */
    invalidate(): Promise<void> {
      const pending: Promise<void>[] = []
      for (const [key, entry] of entries) {
        if (entry.listeners.size > 0) pending.push(load(entry))
        else entries.delete(key)
      }
      return Promise.all(pending).then(() => undefined)
    },
  }
}
