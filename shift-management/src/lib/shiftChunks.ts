import { addMonths, endOfMonth, startOfMonth } from 'date-fns'
import { fromDateKey, toDateKey } from './time'

export type SortOrder = 'asc' | 'desc'

export interface DateRange {
  /** yyyy-MM-dd */
  from: string
  /** yyyy-MM-dd */
  to: string
}

/**
 * Chia khoảng ngày của bộ lọc thành các lát theo tháng, để cuộn tới đâu tải
 * tới đó.
 *
 * Lát được xếp **theo chiều sắp xếp**: cũ → mới thì bắt đầu từ đầu khoảng và
 * tiến dần, mới → cũ thì bắt đầu từ cuối khoảng và lùi dần. Nhờ vậy lát mới
 * luôn nối vào cuối danh sách, chiều nào cũng không bị chèn lên đầu.
 *
 * Đầu nào của bộ lọc bỏ trống thì lấy ngày ca sớm nhất / muộn nhất làm mốc,
 * và đầu nào rộng hơn dữ liệu thật thì bị thu lại — không tải những tháng
 * chắc chắn rỗng.
 */
export function planMonthChunks({
  from,
  to,
  earliest,
  latest,
  order,
  count,
}: {
  from: string | null
  to: string | null
  /** Ngày ca sớm nhất, `null` khi không có ca nào. */
  earliest: string | null
  latest: string | null
  order: SortOrder
  /** Số lát muốn tải, tính từ đầu theo chiều sắp xếp. */
  count: number
}): { chunks: DateRange[]; hasMore: boolean } {
  if (!earliest || !latest) return { chunks: [], hasMore: false }

  const start = from && from > earliest ? from : earliest
  const end = to && to < latest ? to : latest
  if (start > end) return { chunks: [], hasMore: false }

  const chunks: DateRange[] = []
  const anchor = startOfMonth(fromDateKey(order === 'asc' ? start : end))

  for (let i = 0; i < count; i++) {
    const month = addMonths(anchor, order === 'asc' ? i : -i)
    const monthFrom = toDateKey(startOfMonth(month))
    const monthTo = toDateKey(endOfMonth(month))
    const chunk = {
      from: monthFrom > start ? monthFrom : start,
      to: monthTo < end ? monthTo : end,
    }
    if (chunk.from > chunk.to) break
    chunks.push(chunk)
  }

  const last = chunks[chunks.length - 1]
  const hasMore = last
    ? order === 'asc'
      ? last.to < end
      : last.from > start
    : false

  return { chunks, hasMore }
}
