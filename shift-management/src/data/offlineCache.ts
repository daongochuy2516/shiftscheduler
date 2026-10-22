/**
 * Bản lưu trên máy của những gì đã đọc từ máy chủ (IndexedDB), để mất mạng
 * vẫn mở lại được đúng màn hình đã xem lần cuối.
 *
 * - Mỗi mục khoá theo `chủ|tên phép đọc|tham số`. Chủ là người đang đăng
 *   nhập: hai tài khoản dùng chung máy không đọc được bản lưu của nhau, và
 *   đổi tài khoản là xoá phần của người trước (`setOfflineOwner`).
 * - Đăng xuất xoá sạch (`clearOfflineData`) — máy dùng chung không giữ lại
 *   lịch của ai.
 * - Chỉ giữ `MAX_AGE_MS` (2 ngày): lịch cũ hơn thế dễ sai so với thực tế,
 *   offline thì thà báo "chưa có bản lưu" còn hơn hiện lịch đã đổi. Mục quá
 *   hạn coi như không có và bị xoá.
 * - Giữ tối đa `MAX_ENTRIES` mục mới nhất; cuộn qua nhiều tháng thì tháng
 *   xem lâu nhất bị bỏ trước.
 * - IndexedDB không dùng được (một số chế độ ẩn danh) thì mọi hàm thành
 *   không làm gì: app chạy như chưa có bản lưu.
 */

const DB_NAME = 'thinkmay-offline'
const STORE = 'reads'
const MAX_ENTRIES = 400
/**
 * Bản lưu quá ngần này thì bỏ. Đổi số thì sửa cả chữ "48 hours" trong từ
 * điển (`status.app.savedHint`), "2 ngày" ở help/content.ts và README mục 9g.
 */
export const MAX_AGE_MS = 2 * 24 * 60 * 60_000
/** Dọn sau mỗi ngần này lần ghi, không dọn mỗi lần cho đỡ tốn. */
const PRUNE_EVERY = 25

interface Entry {
  key: string
  owner: string
  savedAt: number
  data: unknown
}

export interface CachedRead<T> {
  data: T
  /** Lúc lưu (ms epoch, giờ máy). */
  savedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('savedAt', 'savedAt')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

/** Chạy một giao dịch; xong (hay hỏng) thì trả kết quả của `fn`. */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, done: (value: T) => void) => void,
  fallback: T,
): Promise<T> {
  const db = await openDb()
  if (!db) return fallback
  return new Promise<T>((resolve) => {
    let result = fallback
    try {
      const tx = db.transaction(STORE, mode)
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => resolve(fallback)
      tx.onabort = () => resolve(fallback)
      fn(tx.objectStore(STORE), (value) => {
        result = value
      })
    } catch {
      resolve(fallback)
    }
  })
}

let owner: string | null = null
let writes = 0

/** Quá hạn — hoặc nằm ở tương lai xa vì đồng hồ máy từng bị chỉnh lùi. */
function expired(savedAt: number): boolean {
  const age = Date.now() - savedAt
  return age > MAX_AGE_MS || age < -MAX_AGE_MS
}

/**
 * Người đang đăng nhập. Gọi trước khi màn hình đầu tiên đọc dữ liệu. Đổi
 * sang người khác thì xoá bản lưu của mọi người còn lại.
 */
export function setOfflineOwner(id: string | null) {
  if (id === owner) return
  owner = id
  // Mở app là dịp dọn: bản lưu của người khác, và mục đã quá hạn.
  if (id) void dropOtherOwners(id).then(prune)
}

/** Khoá của một phép đọc cho người hiện tại; `null` khi chưa đăng nhập. */
export function offlineKey(name: string): string | null {
  return owner ? `${owner}|${name}` : null
}

export function readCached<T>(key: string): Promise<CachedRead<T> | null> {
  return withStore<CachedRead<T> | null>(
    'readonly',
    (store, done) => {
      const req = store.get(key)
      req.onsuccess = () => {
        const entry = req.result as Entry | undefined
        if (entry && expired(entry.savedAt)) {
          void withStore<void>('readwrite', (s) => s.delete(key), undefined)
          done(null)
          return
        }
        done(entry ? { data: entry.data as T, savedAt: entry.savedAt } : null)
      }
    },
    null,
  )
}

export async function writeCached(key: string, data: unknown): Promise<void> {
  // Đã đăng xuất / đổi người trong lúc chờ máy chủ: câu trả lời thuộc về
  // phiên cũ, không lưu.
  if (!owner || !key.startsWith(`${owner}|`)) return
  const entry: Entry = { key, owner, savedAt: Date.now(), data }
  await withStore<void>('readwrite', (store) => store.put(entry), undefined)
  if (++writes % PRUNE_EVERY === 0) void prune()
}

/**
 * Xoá mục quá hạn, và bỏ các mục cũ nhất cho tới khi còn `MAX_ENTRIES`.
 * Đi theo index `savedAt` từ cũ tới mới, nên một lượt cursor làm được cả hai.
 */
function prune(): Promise<void> {
  return withStore<void>(
    'readwrite',
    (store) => {
      const count = store.count()
      count.onsuccess = () => {
        let excess = count.result - MAX_ENTRIES
        const cursor = store.index('savedAt').openCursor()
        cursor.onsuccess = () => {
          const c = cursor.result
          if (!c) return
          const entry = c.value as Entry
          if (expired(entry.savedAt) || excess > 0) {
            c.delete()
            excess--
          }
          // Đi hết (tối đa vài trăm mục): mục "ở tương lai" do chỉnh đồng hồ
          // nằm cuối index, dừng sớm thì sót.
          c.continue()
        }
      }
    },
    undefined,
  )
}

function dropOtherOwners(keep: string): Promise<void> {
  return withStore<void>(
    'readwrite',
    (store) => {
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) return
        if ((c.value as Entry).owner !== keep) c.delete()
        c.continue()
      }
    },
    undefined,
  )
}

/** Xoá mọi bản lưu trên máy (đăng xuất). */
export function clearOfflineData(): Promise<void> {
  owner = null
  return withStore<void>('readwrite', (store) => store.clear(), undefined)
}

/**
 * Xoá bản lưu nhưng vẫn đăng nhập (nút trên trang Trạng thái): những gì đọc
 * sau đó lại được lưu như thường.
 */
export function resetOfflineData(): Promise<void> {
  return withStore<void>('readwrite', (store) => store.clear(), undefined)
}

/** Loại phép đọc, theo phần đầu của tên trong khoá (xem offlineBackend.ts). */
export type OfflineKind = 'shifts' | 'bounds' | 'logs' | 'profiles' | 'templates'

const KINDS: readonly OfflineKind[] = ['shifts', 'bounds', 'logs', 'profiles', 'templates']

export interface OfflineStats {
  /** Số phép đọc đang có bản lưu. */
  count: number
  /** Bản lưu mới nhất / cũ nhất, `null` khi chưa có gì. */
  lastSavedAt: number | null
  firstSavedAt: number | null
  /** Cỡ dữ liệu (byte UTF-8 của JSON) — gần đúng, không tính phần IndexedDB tự thêm. */
  bytes: number
  byKind: Record<OfflineKind, number>
}

/** Bản lưu của người hiện tại — cho trang Trạng thái. `null`: không có IndexedDB. */
export async function offlineStats(): Promise<OfflineStats | null> {
  if (!(await openDb())) return null
  const me = owner
  const empty = (): OfflineStats => ({
    count: 0,
    lastSavedAt: null,
    firstSavedAt: null,
    bytes: 0,
    byKind: { shifts: 0, bounds: 0, logs: 0, profiles: 0, templates: 0 },
  })
  const encoder = new TextEncoder()
  return withStore<OfflineStats>(
    'readonly',
    (store, done) => {
      const stats = empty()
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const c = cursor.result
        if (!c) {
          done(stats)
          return
        }
        const entry = c.value as Entry
        if (entry.owner === me && !expired(entry.savedAt)) {
          stats.count++
          stats.lastSavedAt = Math.max(stats.lastSavedAt ?? 0, entry.savedAt)
          stats.firstSavedAt = Math.min(stats.firstSavedAt ?? Infinity, entry.savedAt)
          stats.bytes += encoder.encode(JSON.stringify(entry.data) ?? '').length
          const kind = entry.key.slice(entry.owner.length + 1).split('|')[0]
          if ((KINDS as readonly string[]).includes(kind)) {
            stats.byKind[kind as OfflineKind]++
          }
        }
        c.continue()
      }
    },
    empty(),
  )
}
