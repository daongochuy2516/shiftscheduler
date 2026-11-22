import type { Location, UUID } from '../types'

/**
 * Thứ tự hiển thị nơi trực: `sort_order` do admin đặt, trùng thì theo tên.
 * Cùng thứ tự với `listLocations` của hai backend.
 */
export function compareLocations(a: Location, b: Location): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

/** Bản sao đã sắp xếp — không sửa mảng gốc (có thể là state của React). */
export function sortLocations(list: readonly Location[]): Location[] {
  return [...list].sort(compareLocations)
}

/** Những nơi còn chọn được khi nhận / sửa ca (bỏ nơi đang ẩn). */
export function activeLocations(list: readonly Location[]): Location[] {
  return sortLocations(list.filter((l) => l.is_active))
}

/**
 * Tên tắt cho chỗ hẹp: `short_name` admin đặt, không có thì 3 ký tự đầu của
 * tên ("Discord" → "Dis").
 */
export function locationShortName(location: Location): string {
  const short = location.short_name?.trim()
  if (short) return short
  return Array.from(location.name.trim()).slice(0, 3).join('')
}

export function locationsById(list: readonly Location[]): Map<UUID, Location> {
  return new Map(list.map((l) => [l.id, l]))
}

/**
 * Id nơi trực của một lượt theo thứ tự hiển thị. Id lạ (nơi đã bị xoá — mảng
 * không có khoá ngoại) xếp cuối, giữ thứ tự cũ giữa chúng.
 */
export function sortLocationIds(
  ids: readonly UUID[],
  byId: ReadonlyMap<UUID, Location>,
): UUID[] {
  return [...ids].sort((a, b) => {
    const la = byId.get(a)
    const lb = byId.get(b)
    if (la && lb) return compareLocations(la, lb)
    if (la) return -1
    if (lb) return 1
    return 0
  })
}

/**
 * Dạng chuẩn của `location_ids` như trigger của 012 lưu: không trùng, sắp
 * theo id. So sánh hai lượt bằng dạng này thì đổi thứ tự chọn không bị tính
 * là "đã sửa".
 */
export function normalizeLocationIds(ids: readonly UUID[]): UUID[] {
  return [...new Set(ids)].sort()
}

/** Hai danh sách nơi trực có giống nhau không (bỏ qua thứ tự, trùng lặp). */
export function sameLocationIds(a: readonly UUID[], b: readonly UUID[]): boolean {
  const x = normalizeLocationIds(a)
  const y = normalizeLocationIds(b)
  return x.length === y.length && x.every((id, i) => id === y[i])
}
