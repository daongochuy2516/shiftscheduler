import type { UUID } from '../types'
import type { SortOrder } from './shiftChunks'

/** Bộ lọc phụ của trang Tất cả ca, thu hẹp thêm bên trong tab đang chọn. */
export interface ShiftFilters {
  /** yyyy-MM-dd, `null` = không giới hạn đầu này. */
  from: string | null
  to: string | null
  /** AND: ca phải có tất cả những người này. */
  staffIds: UUID[]
  order: SortOrder
}

export const DEFAULT_SHIFT_FILTERS: ShiftFilters = {
  from: null,
  to: null,
  staffIds: [],
  order: 'asc',
}
