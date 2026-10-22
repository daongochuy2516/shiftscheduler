import { useSyncExternalStore } from 'react'
import { isOnline } from '../lib/network'

/**
 * Tình trạng kết nối mà giao diện cần biết: có mạng không, và màn hình có
 * đang hiện dữ liệu lấy từ bản lưu trên máy (thay vì từ máy chủ) không.
 */
export interface NetworkStatus {
  online: boolean
  /**
   * Thời điểm (ms) của bản lưu mới nhất vừa được dùng thay cho máy chủ;
   * `null` khi lần đọc gần nhất lấy được từ máy chủ.
   */
  staleSince: number | null
}

// Snapshot đổi tham chiếu chỉ khi nội dung đổi: useSyncExternalStore so sánh
// theo tham chiếu, trả object mới mỗi lần là render vô hạn.
let status: NetworkStatus = { online: isOnline(), staleSince: null }
const listeners = new Set<() => void>()

function set(next: NetworkStatus) {
  if (next.online === status.online && next.staleSince === status.staleSince) {
    return
  }
  status = next
  listeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => set({ ...status, online: true }))
  window.addEventListener('offline', () => set({ ...status, online: false }))
}

/** Vừa phải dùng bản lưu lúc `savedAt` vì không tới được máy chủ. */
export function markStale(savedAt: number) {
  set({ ...status, staleSince: savedAt })
}

/** Vừa đọc được từ máy chủ: dữ liệu trên màn hình là mới. */
export function markFresh() {
  set({ online: isOnline(), staleSince: null })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getNetworkStatus(): NetworkStatus {
  return status
}

export function useNetworkStatus(): NetworkStatus {
  return useSyncExternalStore(subscribe, getNetworkStatus)
}

// ---- số liệu của phiên này, cho trang Trạng thái ----

/**
 * Đếm từ lúc mở tab tới giờ, chỉ nằm trong bộ nhớ (tải lại trang là về 0).
 * Tách khỏi `NetworkStatus`: số đếm đổi sau mỗi lần đọc, không để băng
 * offline phải vẽ lại theo.
 */
export interface OfflineMetrics {
  /** Lần đọc lấy được từ máy chủ. */
  networkReads: number
  /** Lần đọc phải dùng bản lưu thay máy chủ. */
  cacheReads: number
  /** Trong số đó, bao nhiêu lần vì máy chủ trả lời quá chậm (còn lại: mất mạng). */
  slowFallbacks: number
  /** Thao tác ghi bị chặn vì đang offline. */
  blockedWrites: number
  /** Số lần mất mạng. */
  offlineCount: number
  /** Tổng thời gian offline của những lần đã có mạng lại (ms). */
  offlineMs: number
  /** Đang offline từ lúc nào; `null` khi đang có mạng. */
  offlineSince: number | null
}

let metrics: OfflineMetrics = {
  networkReads: 0,
  cacheReads: 0,
  slowFallbacks: 0,
  blockedWrites: 0,
  offlineCount: status.online ? 0 : 1,
  offlineMs: 0,
  offlineSince: status.online ? null : Date.now(),
}
const metricListeners = new Set<() => void>()

function bump(patch: (m: OfflineMetrics) => Partial<OfflineMetrics>) {
  metrics = { ...metrics, ...patch(metrics) }
  metricListeners.forEach((fn) => fn())
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    if (metrics.offlineSince !== null) return
    bump((m) => ({ offlineCount: m.offlineCount + 1, offlineSince: Date.now() }))
  })
  window.addEventListener('online', () => {
    const since = metrics.offlineSince
    if (since === null) return
    bump((m) => ({ offlineMs: m.offlineMs + (Date.now() - since), offlineSince: null }))
  })
}

export function countNetworkRead() {
  bump((m) => ({ networkReads: m.networkReads + 1 }))
}

export function countCacheRead(slow: boolean) {
  bump((m) => ({
    cacheReads: m.cacheReads + 1,
    slowFallbacks: m.slowFallbacks + (slow ? 1 : 0),
  }))
}

export function countBlockedWrite() {
  bump((m) => ({ blockedWrites: m.blockedWrites + 1 }))
}

function subscribeMetrics(listener: () => void): () => void {
  metricListeners.add(listener)
  return () => metricListeners.delete(listener)
}

export function useOfflineMetrics(): OfflineMetrics {
  return useSyncExternalStore(subscribeMetrics, () => metrics)
}
