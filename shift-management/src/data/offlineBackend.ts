import type { SchedulerBackend } from './backend'
import { offlineKey, readCached, writeCached } from './offlineCache'
import {
  countBlockedWrite,
  countCacheRead,
  countNetworkRead,
  markFresh,
  markStale,
} from './networkStatus'
import { shiftQueryKey } from './shiftStore'
import { OfflineError, isNetworkError, isOnline } from '../lib/network'

/**
 * Chờ máy chủ tới ngần này rồi thôi, nếu máy đã có bản lưu: wifi bắt được
 * mà không ra internet thì yêu cầu treo rất lâu (supabase-js còn tự thử lại
 * phần làm mới phiên tới ~30 giây), người dùng không nên nhìn khung xương
 * suốt thời gian đó.
 */
const SLOW_MS = 5000

/** Màn hình nào đang hiện bản lưu cũ mà máy chủ vừa trả bản mới về muộn. */
const lateListeners = new Set<() => void>()

/**
 * Đọc qua mạng trước, hỏng mạng thì lấy bản lưu (network-first).
 *
 * - Offline chắc chắn: không gọi mạng, trả bản lưu luôn; chưa có thì
 *   `OfflineError` (trang hiện câu "chưa có bản lưu").
 * - Có mạng: đọc được thì lưu lại. Lỗi mạng, hoặc quá `SLOW_MS` mà đã có
 *   bản lưu, thì trả bản lưu và đánh dấu dữ liệu cũ (băng offline).
 * - Lỗi của máy chủ (quyền, ràng buộc…) đi thẳng ra ngoài, không che bằng
 *   bản lưu: dữ liệu cũ không được trông như câu trả lời hợp lệ.
 */
async function cachedRead<T>(name: string, run: () => Promise<T>): Promise<T> {
  const key = offlineKey(name)
  if (!key) return run()

  if (!isOnline()) {
    const hit = await readCached<T>(key)
    if (!hit) throw new OfflineError()
    markStale(hit.savedAt)
    countCacheRead(false)
    return hit.data
  }

  const cached = readCached<T>(key)
  const network = run().then((data) => {
    void writeCached(key, data)
    markFresh()
    countNetworkRead()
    return data
  })

  let timer = 0
  const slow = new Promise<'slow'>((resolve) => {
    timer = window.setTimeout(() => resolve('slow'), SLOW_MS)
  })

  try {
    const first = await Promise.race([network, slow])
    if (first !== 'slow') return first
    const hit = await cached
    if (!hit) return await network
    markStale(hit.savedAt)
    countCacheRead(true)
    // Máy chủ trả về muộn mà khác bản đang hiện: báo các màn hình tải lại
    // (lần tải đó đọc bản vừa lưu nếu mạng vẫn chậm, nên không lặp mãi).
    network.then(
      (fresh) => {
        if (JSON.stringify(fresh) !== JSON.stringify(hit.data)) {
          lateListeners.forEach((fn) => fn())
        }
      },
      () => undefined,
    )
    return hit.data
  } catch (err) {
    if (!isNetworkError(err)) throw err
    const hit = await cached
    if (!hit) throw err
    markStale(hit.savedAt)
    countCacheRead(false)
    return hit.data
  } finally {
    window.clearTimeout(timer)
  }
}

/** Thao tác ghi khi offline: chặn ngay, không xếp hàng gửi sau. */
function online<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return (...args) => {
    if (!isOnline()) {
      countBlockedWrite()
      return Promise.reject(new OfflineError())
    }
    return fn(...args)
  }
}

/**
 * Bọc một backend để đọc được khi mất mạng.
 *
 * Ghi thì không xếp hàng gửi sau: luật điểm danh dùng `now()` của máy chủ,
 * một lượt điểm danh "gửi bù" khi có mạng lại sẽ sai giờ hoặc bị từ chối.
 * Offline là chỉ xem.
 *
 * Bọc cả bản mock, để thử trong DevTools (Network → Offline) thấy đúng như
 * bản thật.
 */
export function withOfflineCache(inner: SchedulerBackend): SchedulerBackend {
  return {
    listProfiles: () => cachedRead('profiles', () => inner.listProfiles()),

    listShifts: (query) =>
      cachedRead(`shifts|${shiftQueryKey(query)}`, () => inner.listShifts(query)),

    shiftDateBounds: (userIds) =>
      cachedRead(`bounds|${[...userIds].sort().join('+')}`, () =>
        inner.shiftDateBounds(userIds),
      ),

    listTemplates: () => cachedRead('templates', () => inner.listTemplates()),

    listActionLogs: (query) =>
      cachedRead(`logs|${JSON.stringify(query)}`, () =>
        inner.listActionLogs(query),
      ),

    // Không lưu giờ máy chủ: offline thì useServerClock giữ độ lệch lần
    // trước. Không phải thao tác ghi nên không đếm vào "bị chặn".
    serverTime: () =>
      isOnline() ? inner.serverTime() : Promise.reject(new OfflineError()),

    updateProfile: online((id, input) => inner.updateProfile(id, input)),
    createShift: online((input, assignments) =>
      inner.createShift(input, assignments),
    ),
    updateShift: online((id, input, assignments) =>
      inner.updateShift(id, input, assignments),
    ),
    deleteShift: online((id) => inner.deleteShift(id)),
    setAssignmentStatus: online((id, status) =>
      inner.setAssignmentStatus(id, status),
    ),
    createTemplate: online((input) => inner.createTemplate(input)),
    updateTemplate: online((id, input) => inner.updateTemplate(id, input)),
    deleteTemplate: online((id) => inner.deleteTemplate(id)),
    claimTemplate: online((templateId, date, userId) =>
      inner.claimTemplate(templateId, date, userId),
    ),

    subscribe(onChange) {
      const unsubscribe = inner.subscribe(onChange)
      // Realtime không báo những gì đổi trong lúc mất mạng: có mạng lại thì
      // tải lại mọi thứ đang hiển thị.
      const onOnline = () => onChange()
      window.addEventListener('online', onOnline)
      lateListeners.add(onChange)
      return () => {
        unsubscribe()
        window.removeEventListener('online', onOnline)
        lateListeners.delete(onChange)
      }
    },
  }
}
