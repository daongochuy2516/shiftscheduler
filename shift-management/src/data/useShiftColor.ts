import { useMemo } from 'react'
import type { Shift } from '../types'
import { shiftColor, type ShiftColor } from '../lib/colors'
import { useSchedule } from './ScheduleContext'

export function useShiftColor(): (
  shift: Pick<Shift, 'id' | 'template_id'>,
) => ShiftColor {
  const { templates } = useSchedule()
  return useMemo(() => {
    const byId = new Map(templates.map((t) => [t.id, t]))
    return (shift) => shiftColor(shift, byId)
  }, [templates])
}
