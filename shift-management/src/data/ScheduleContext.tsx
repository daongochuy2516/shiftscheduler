import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AssignmentInput,
  AssignmentStatus,
  Profile,
  ShiftInput,
  ShiftTemplate,
  ShiftWithAssignments,
  TemplateInput,
  UUID,
} from '../types'
import { backend } from './index'

interface ScheduleContextValue {
  shifts: ShiftWithAssignments[]
  profiles: Profile[]
  profilesById: Map<UUID, Profile>
  templates: ShiftTemplate[]
  /** False when the templates migration has not been run yet. */
  templatesAvailable: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createShift: (
    input: ShiftInput,
    assignments: AssignmentInput[],
  ) => Promise<void>
  updateShift: (
    id: UUID,
    input: ShiftInput,
    assignments: AssignmentInput[],
  ) => Promise<void>
  deleteShift: (id: UUID) => Promise<void>
  setAssignmentStatus: (
    assignmentId: UUID,
    status: AssignmentStatus,
  ) => Promise<void>
  createTemplate: (input: TemplateInput) => Promise<void>
  updateTemplate: (id: UUID, input: TemplateInput) => Promise<void>
  deleteTemplate: (id: UUID) => Promise<void>
  /** Claims one template across several days in one go. */
  claimTemplate: (
    templateId: UUID,
    dates: string[],
    userId: UUID,
  ) => Promise<void>
}

const ScheduleContext = createContext<ScheduleContextValue | null>(null)

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [shifts, setShifts] = useState<ShiftWithAssignments[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [templatesAvailable, setTemplatesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [nextShifts, nextProfiles, nextTemplates] = await Promise.all([
        backend.listShifts(),
        backend.listProfiles(),
        backend.listTemplates(),
      ])
      if (!mounted.current) return
      setShifts(nextShifts)
      setProfiles(nextProfiles)
      // null means the templates migration hasn't been run.
      setTemplatesAvailable(nextTemplates !== null)
      setTemplates(nextTemplates ?? [])
      setError(null)
    } catch (err) {
      if (!mounted.current) return
      setError(err instanceof Error ? err.message : 'Failed to load schedule.')
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Realtime: re-fetch whenever anyone else changes shifts or assignments.
    const unsubscribe = backend.subscribe(() => {
      void refresh()
    })
    return unsubscribe
  }, [refresh])

  const createShift = useCallback(
    async (input: ShiftInput, assignments: AssignmentInput[]) => {
      await backend.createShift(input, assignments)
      await refresh()
    },
    [refresh],
  )

  const updateShift = useCallback(
    async (id: UUID, input: ShiftInput, assignments: AssignmentInput[]) => {
      await backend.updateShift(id, input, assignments)
      await refresh()
    },
    [refresh],
  )

  const deleteShift = useCallback(
    async (id: UUID) => {
      await backend.deleteShift(id)
      await refresh()
    },
    [refresh],
  )

  const setAssignmentStatus = useCallback(
    async (assignmentId: UUID, status: AssignmentStatus) => {
      await backend.setAssignmentStatus(assignmentId, status)
      await refresh()
    },
    [refresh],
  )

  const createTemplate = useCallback(
    async (input: TemplateInput) => {
      await backend.createTemplate(input)
      await refresh()
    },
    [refresh],
  )

  const updateTemplate = useCallback(
    async (id: UUID, input: TemplateInput) => {
      await backend.updateTemplate(id, input)
      await refresh()
    },
    [refresh],
  )

  const deleteTemplate = useCallback(
    async (id: UUID) => {
      await backend.deleteTemplate(id)
      await refresh()
    },
    [refresh],
  )

  const claimTemplate = useCallback(
    async (templateId: UUID, dates: string[], userId: UUID) => {
      // Sequential rather than parallel: each day may have to create the
      // shift first, and the unique index would reject a burst of inserts.
      // One refresh at the end instead of one per day.
      try {
        for (const date of dates) {
          await backend.claimTemplate(templateId, date, userId)
        }
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  )

  const value = useMemo(
    () => ({
      shifts,
      profiles,
      profilesById,
      templates,
      templatesAvailable,
      loading,
      error,
      refresh,
      createShift,
      updateShift,
      deleteShift,
      setAssignmentStatus,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      claimTemplate,
    }),
    [
      shifts,
      profiles,
      profilesById,
      templates,
      templatesAvailable,
      loading,
      error,
      refresh,
      createShift,
      updateShift,
      deleteShift,
      setAssignmentStatus,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      claimTemplate,
    ],
  )

  return (
    <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext)
  if (!ctx) throw new Error('useSchedule must be used inside <ScheduleProvider>')
  return ctx
}
