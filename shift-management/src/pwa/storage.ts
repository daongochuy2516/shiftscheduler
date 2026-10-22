/**
 * Số liệu của trình duyệt cho trang Trạng thái: dung lượng đang dùng, vỏ ứng
 * dụng service worker đã lưu, loại mạng. Mọi hàm trả `null` khi trình duyệt
 * không có API tương ứng.
 */

export interface StorageInfo {
  /** Byte trang này đang dùng (Cache Storage + IndexedDB + …). */
  usage: number
  /** Trần trình duyệt cho phép trang này. */
  quota: number
}

export async function storageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) return null
  try {
    const estimate = await navigator.storage.estimate()
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}

export interface PrecacheInfo {
  files: number
  bytes: number
}

/**
 * Vỏ ứng dụng service worker đã tải sẵn (cache `workbox-precache-…`).
 * `null`: chưa có (dev, lần mở đầu chưa cài xong, hay không có Cache Storage).
 */
export async function precacheInfo(): Promise<PrecacheInfo | null> {
  if (typeof caches === 'undefined') return null
  try {
    const name = (await caches.keys()).find((n) => n.includes('precache'))
    if (!name) return null
    const cache = await caches.open(name)
    const requests = await cache.keys()
    let bytes = 0
    for (const request of requests) {
      const response = await cache.match(request)
      if (response) bytes += (await response.blob()).size
    }
    return { files: requests.length, bytes }
  } catch {
    return null
  }
}

/** Network Information API — chỉ Chrome / Edge / Android có. */
interface NetworkInformation {
  rtt?: number
  downlink?: number
  saveData?: boolean
}

export interface ConnectionInfo {
  rtt: number | null
  /** Mbps. */
  downlink: number | null
  saveData: boolean
}

export function connectionInfo(): ConnectionInfo | null {
  const conn = (navigator as Navigator & { connection?: NetworkInformation })
    .connection
  if (!conn) return null
  return {
    rtt: conn.rtt ?? null,
    downlink: conn.downlink ?? null,
    saveData: conn.saveData === true,
  }
}
