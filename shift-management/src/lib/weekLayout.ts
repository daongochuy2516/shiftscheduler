import { toMinutes } from './time'

/**
 * Hàm thuần cho lịch tuần dạng cột (WeekCalendar): chọn khung giờ hiển thị
 * và xếp các khối chồng giờ nằm cạnh nhau như Google Calendar.
 */

/** Khung giờ hiển thị — cùng dạng với `HourRange` của Timeline. */
export interface HourRange {
  /** Whole hour, 0–23 */
  startHour: number
  /** Whole hour, 1–24 */
  endHour: number
}

/** Một khoảng giờ "HH:mm" (hoặc "HH:mm:ss") trong ngày. */
export interface TimeSpan {
  start: string
  end: string
}

/** Các mức của ô "Khung giờ" — khớp `SCALES` ở TimelinePage. */
export type HourScale = 'fit' | 'full' | 'work' | 'business'

/** Khung mặc định khi không có lượt nào để "vừa theo". */
export const DEFAULT_HOUR_RANGE: HourRange = { startHour: 8, endHour: 20 }

/**
 * "Vừa theo" các khoảng giờ: giờ sớm nhất làm tròn xuống − 1h tới giờ muộn
 * nhất làm tròn lên + 1h, ít nhất `minHours` giờ, trong 0–24. Không có khoảng
 * nào thì 08:00–20:00. Cùng luật với chế độ Ngày của trang Lịch.
 */
export function fitHourRange(
  spans: Iterable<TimeSpan>,
  minHours = 6,
): HourRange {
  let min = Infinity
  let max = -Infinity
  for (const s of spans) {
    min = Math.min(min, toMinutes(s.start), toMinutes(s.end))
    max = Math.max(max, toMinutes(s.start), toMinutes(s.end))
  }
  if (min === Infinity) return { ...DEFAULT_HOUR_RANGE }

  let startHour = Math.max(0, Math.floor(min / 60) - 1)
  let endHour = Math.min(24, Math.ceil(max / 60) + 1)
  if (endHour - startHour < minHours) {
    endHour = Math.min(24, startHour + minHours)
    startHour = Math.max(0, endHour - minHours)
  }
  return { startHour, endHour }
}

/** Khung giờ của một mức "Khung giờ"; `fit` tính trên `spans`. */
export function hourRangeForScale(
  scale: HourScale,
  spans: Iterable<TimeSpan>,
): HourRange {
  if (scale === 'full') return { startHour: 0, endHour: 24 }
  if (scale === 'work') return { startHour: 6, endHour: 22 }
  if (scale === 'business') return { startHour: 8, endHour: 20 }
  return fitHourRange(spans)
}

/** Khoảng giờ nằm trọn ngoài khung (không vẽ được chút nào). */
export function isOutsideRange(span: TimeSpan, range: HourRange): boolean {
  return (
    toMinutes(span.end) <= range.startHour * 60 ||
    toMinutes(span.start) >= range.endHour * 60
  )
}

/** Số khoảng giờ nằm trọn ngoài khung — cho dòng nhắc "nằm ngoài khung giờ". */
export function countOutsideRange(
  spans: Iterable<TimeSpan>,
  range: HourRange,
): number {
  let count = 0
  for (const s of spans) if (isOutsideRange(s, range)) count += 1
  return count
}

export interface LaidOutItem<T> {
  item: T
  /**
   * Phút từ nửa đêm, đã kẹp vào khung giờ — là điểm VẼ: khối ngắn sát cuối
   * khung có thể bị kéo lên sớm hơn giờ thật để vừa trong lưới.
   */
  startMin: number
  endMin: number
  /** Làn (0-based) trong cụm chồng giờ của nó. */
  lane: number
  /** Số làn của cả cụm — bề rộng một làn = 1 / lanes cột ngày. */
  lanes: number
  /**
   * Số làn khối chiếm được (≥ 1): khối nới sang các làn bên phải khi ở đó
   * không có khối nào chồng giờ với nó, như Google Calendar.
   */
  span: number
}

/**
 * Xếp các khối của MỘT ngày thành làn. Khối chồng giờ (kể cả chồng gián
 * tiếp qua khối thứ ba) gom thành một cụm; trong cụm mỗi khối vào làn trống
 * đầu tiên, cả cụm chia đều bề rộng cột. Khối nằm trọn ngoài khung bị bỏ.
 *
 * `minMinutes`: độ dài tối thiểu khi xét chồng giờ — khối ngắn được vẽ cao
 * hơn thời lượng thật (chiều cao tối thiểu), nên phải coi nó dài chừng đó
 * để không đè lên khối ngay sau nó.
 */
export function layoutDay<T extends TimeSpan>(
  items: readonly T[],
  range: HourRange,
  minMinutes = 0,
): LaidOutItem<T>[] {
  const rangeStart = range.startHour * 60
  const rangeEnd = range.endHour * 60

  const visible = items
    .filter((item) => !isOutsideRange(item, range))
    .map((item) => {
      // Khối ngắn sát cuối khung được vẽ cao `minMinutes` → kéo điểm vẽ lên
      // để mép dưới không lòi ra ngoài lưới (như Google Calendar).
      const startMin = Math.max(
        rangeStart,
        Math.min(toMinutes(item.start), rangeEnd - minMinutes),
      )
      const endMin = Math.min(toMinutes(item.end), rangeEnd)
      return {
        item,
        startMin,
        endMin,
        // Phần "chiếm chỗ" khi vẽ, dùng để xét chồng giờ.
        visualEnd: Math.max(endMin, startMin + minMinutes),
      }
    })
    // Sớm trước; cùng giờ bắt đầu thì khối dài hơn đứng bên trái.
    .sort((a, b) => a.startMin - b.startMin || b.visualEnd - a.visualEnd)

  const result: LaidOutItem<T>[] = []
  let cluster: ((typeof visible)[number] & { lane: number })[] = []
  let laneEnds: number[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length)
    for (const entry of cluster) {
      // Nới sang phải tới khi gặp làn có khối chồng giờ với khối này.
      let span = 1
      for (let next = entry.lane + 1; next < lanes; next++) {
        const blocked = cluster.some(
          (other) =>
            other.lane === next &&
            other.startMin < entry.visualEnd &&
            entry.startMin < other.visualEnd,
        )
        if (blocked) break
        span += 1
      }
      result.push({
        item: entry.item,
        startMin: entry.startMin,
        endMin: entry.endMin,
        lane: entry.lane,
        lanes,
        span,
      })
    }
    cluster = []
    laneEnds = []
    clusterEnd = -Infinity
  }

  for (const entry of visible) {
    if (entry.startMin >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= entry.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(entry.visualEnd)
    } else {
      laneEnds[lane] = entry.visualEnd
    }
    cluster.push({ ...entry, lane })
    clusterEnd = Math.max(clusterEnd, entry.visualEnd)
  }
  flush()
  return result
}
