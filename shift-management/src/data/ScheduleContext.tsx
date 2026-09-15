import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  AssignmentInput,
  AssignmentStatus,
  Profile,
  ShiftDateBounds,
  ShiftInput,
  ShiftQuery,
  ShiftTemplate,
  TemplateInput,
  UUID,
} from '../types'
import { backend } from './index'
import {
  createShiftStore,
  shiftQueryKey,
  type ShiftQueryState,
  type ShiftStore,
} from './shiftStore'

interface ScheduleContextValue {
  /** Bộ đệm ca theo lát cắt — đọc qua `useShifts`, không dùng trực tiếp. */
  store: ShiftStore
  profiles: Profile[]
  profilesById: Map<UUID, Profile>
  templates: ShiftTemplate[]
  /** False when the templates migration has not been run yet. */
  templatesAvailable: boolean
  /** Chỉ phản ánh nhân viên + ca mẫu. Ca có trạng thái tải riêng theo lát cắt. */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Ngày ca sớm nhất / muộn nhất, tuỳ chọn chỉ tính ca có một nhân viên. */
  shiftDateBounds: (userId: UUID | null) => Promise<ShiftDateBounds>
  /**
   * Tăng mỗi lần dữ liệu đổi (mình lưu, hoặc Realtime báo người khác vừa
   * sửa). Thứ gì tự hỏi backend ngoài bộ đệm ca thì dựa vào số này để biết
   * lúc cần hỏi lại.
   */
  dataVersion: number
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
  // Một bộ đệm cho mỗi phiên đăng nhập: provider này chỉ mount khi đã đăng
  // nhập, nên đăng xuất là bộ đệm mất theo, không lọt dữ liệu sang tài khoản khác.
  const [store] = useState(() =>
    createShiftStore((query) => backend.listShifts(query)),
  )
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [templatesAvailable, setTemplatesAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [dataVersion, setDataVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadMeta = useCallback(async () => {
    try {
      const [nextProfiles, nextTemplates] = await Promise.all([
        backend.listProfiles(),
        backend.listTemplates(),
      ])
      if (!mounted.current) return
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

  /** Tải lại nhân viên + ca mẫu, và mọi lát cắt ca đang hiển thị. */
  const refresh = useCallback(async () => {
    await Promise.all([loadMeta(), store.invalidate()])
    if (mounted.current) setDataVersion((v) => v + 1)
  }, [loadMeta, store])

  useEffect(() => {
    void loadMeta()
    // Realtime: có người đổi dữ liệu thì chỉ tải lại phần đang được xem.
    const unsubscribe = backend.subscribe(() => {
      void refresh()
    })
    return unsubscribe
  }, [loadMeta, refresh])

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

  const shiftDateBounds = useCallback(
    (userId: UUID | null) => backend.shiftDateBounds(userId),
    [],
  )

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  )

  const value = useMemo(
    () => ({
      store,
      profiles,
      profilesById,
      templates,
      templatesAvailable,
      loading,
      error,
      refresh,
      shiftDateBounds,
      dataVersion,
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
      store,
      profiles,
      profilesById,
      templates,
      templatesAvailable,
      loading,
      error,
      refresh,
      shiftDateBounds,
      dataVersion,
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

const IDLE: ShiftQueryState = {
  shifts: [],
  loaded: false,
  loading: false,
  error: null,
}

/**
 * Các ca của đúng một lát cắt. Truyền `null` khi chưa đủ điều kiện để hỏi
 * (ví dụ chưa biết id người dùng) — hook trả trạng thái rỗng, không tải gì.
 *
 * Đổi lát cắt (sang tuần sau) thì `loaded` về false cho tới khi có dữ liệu;
 * còn lát cắt đang xem được làm tươi thì dữ liệu cũ vẫn giữ trên màn hình.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useShifts(query: ShiftQuery | null): ShiftQueryState {
  const { store } = useSchedule()
  const key = query ? shiftQueryKey(query) : null

  const subscribe = useCallback(
    (listener: () => void) =>
      key ? store.subscribe(key, listener) : () => undefined,
    [store, key],
  )
  const getSnapshot = useCallback(
    () => (key ? store.getSnapshot(key) : IDLE),
    [store, key],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Nhiều lát cắt gộp làm một danh sách — dùng khi màn hình tải dần theo từng
 * tháng. Mỗi tháng vẫn là một lát riêng trong bộ đệm, nên tải thêm một tháng
 * không kéo lại những tháng đã có.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useShiftChunks(queries: ShiftQuery[]): ShiftQueryState {
  const { store } = useSchedule()
  const keys = queries.map(shiftQueryKey).join(',')

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubs = keys
        .split(',')
        .filter(Boolean)
        .map((key) => store.subscribe(key, listener))
      return () => unsubs.forEach((unsub) => unsub())
    },
    [store, keys],
  )
  const getSnapshot = useCallback(
    () => store.getCombinedSnapshot(keys.split(',').filter(Boolean)),
    [store, keys],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Tải trước các lát cắt kề bên, để bấm lùi/tới không phải chờ. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePrefetchShifts(queries: ShiftQuery[], enabled: boolean) {
  const { store } = useSchedule()
  const keys = queries.map(shiftQueryKey).join(',')

  useEffect(() => {
    if (!enabled) return
    for (const key of keys.split(',')) store.prefetch(key)
  }, [store, keys, enabled])
}
