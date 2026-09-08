import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ShiftWithAssignments, UUID } from '../types'
import { toDateKey } from '../lib/time'
import { ShiftModal } from './ShiftModal'

interface EditorState {
  shift: ShiftWithAssignments | null
  defaultDate: string
  highlightAssignmentId: UUID | null
}

interface ShiftEditorValue {
  /** Opens the modal in create mode, optionally pre-filling the date. */
  openCreate: (date?: string) => void
  /** Opens the modal in edit mode, optionally highlighting one assignment. */
  openEdit: (shift: ShiftWithAssignments, assignmentId?: UUID) => void
}

const ShiftEditorContext = createContext<ShiftEditorValue | null>(null)

export function ShiftEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState | null>(null)

  const openCreate = useCallback((date?: string) => {
    setState({
      shift: null,
      defaultDate: date ?? toDateKey(new Date()),
      highlightAssignmentId: null,
    })
  }, [])

  const openEdit = useCallback(
    (shift: ShiftWithAssignments, assignmentId?: UUID) => {
      setState({
        shift,
        defaultDate: shift.date,
        highlightAssignmentId: assignmentId ?? null,
      })
    },
    [],
  )

  const value = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit])

  return (
    <ShiftEditorContext.Provider value={value}>
      {children}
      {state && (
        <ShiftModal
          shift={state.shift}
          defaultDate={state.defaultDate}
          highlightAssignmentId={state.highlightAssignmentId}
          onClose={() => setState(null)}
        />
      )}
    </ShiftEditorContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useShiftEditor(): ShiftEditorValue {
  const ctx = useContext(ShiftEditorContext)
  if (!ctx)
    throw new Error('useShiftEditor must be used inside <ShiftEditorProvider>')
  return ctx
}
