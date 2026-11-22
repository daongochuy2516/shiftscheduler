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
  Location,
  LocationInput,
  Profile,
  ProfileInput,
  ShiftDateBounds,
  ShiftInput,
  ShiftQuery,
  ShiftTemplate,
  ShiftWithAssignments,
  TemplateInput,
  UUID,
} from '../types'
import { backend, isRecordId } from './index'
import { sortLocations } from '../lib/locations'
import { isListed } from '../lib/profiles'
import {
  createShiftStore,
  shiftQueryKey,
  type ShiftQueryState,
  type ShiftStore,
} from './shiftStore'

interface ScheduleContextValue {
  /** Bộ đệm ca theo lát cắt — đọc qua `useShifts`, không dùng trực tiếp. */
  store: ShiftStore
  /** Mọi tài khoản, kể cả người đang ẩn — dùng để tra tên. */
  profiles: Profile[]
  profilesById: Map<UUID, Profile>
  /** Những người hiện trong ô chọn / bộ lọc nhân viên (bỏ người đang ẩn). */
  rosterProfiles: Profile[]
  /** False khi migration 007 chưa chạy (cột `displayed` chưa có). */
  accountsAvailable: boolean
  templates: ShiftTemplate[]
  /** False when the templates migration has not been run yet. */
  templatesAvailable: boolean
  /**
   * Mọi nơi trực, kể cả đang ẩn (để tra tên cho lượt cũ), theo `sort_order`
   * rồi tên. Chỉ nơi chọn được: `activeLocations` trong lib/locations.ts.
   */
  locations: Location[]
  /** False khi migration 012 chưa chạy: ẩn mọi thứ về nơi trực. */
  locationsAvailable: boolean
  /**
   * Đã tải được danh sách nơi trực ít nhất một lần chưa. False khi lần tải
   * lỗi (vd offline mà bản lưu chưa có): lúc đó `locations` rỗng không có
   * nghĩa là "chưa có nơi trực nào", đừng bảo người dùng đi nhờ admin.
   */
  locationsLoaded: boolean
  /** Chỉ phản ánh nhân viên + ca mẫu. Ca có trạng thái tải riêng theo lát cắt. */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  /** Ngày ca sớm nhất / muộn nhất, tuỳ chọn chỉ tính ca có tất cả `userIds`. */
  shiftDateBounds: (userIds: UUID[]) => Promise<ShiftDateBounds>
  /**
   * Bản mới nhất của một ca theo id, `null` nếu ca đã bị xoá. Hỏi thẳng máy
   * chủ, không qua bộ đệm: dùng để mở form sửa ca từ chỗ chỉ có id (Nhật
   * ký), và form cần đúng danh sách người hiện tại chứ không phải bản cũ.
   */
  fetchShift: (id: UUID) => Promise<ShiftWithAssignments | null>
  /**
   * Ca theo id nếu đã nằm sẵn trong bộ đệm (một màn hình nào đó vừa tải),
   * không hỏi mạng. Mở form từ link: có sẵn thì hiện ngay, không thì
   * `fetchShift`.
   */
  cachedShift: (id: UUID) => ShiftWithAssignments | null
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
  /** Chỉ admin (trang Tài khoản). */
  updateProfile: (id: UUID, input: ProfileInput) => Promise<void>
  setAssignmentStatus: (
    assignmentId: UUID,
    status: AssignmentStatus,
  ) => Promise<void>
  createTemplate: (input: TemplateInput) => Promise<void>
  updateTemplate: (id: UUID, input: TemplateInput) => Promise<void>
  deleteTemplate: (id: UUID) => Promise<void>
  /** Chỉ admin (012). */
  createLocation: (input: LocationInput) => Promise<void>
  updateLocation: (id: UUID, input: LocationInput) => Promise<void>
  /** Bị từ chối khi còn lượt nào dùng nơi này — khi đó ẩn thay vì xoá. */
  deleteLocation: (id: UUID) => Promise<void>
  /**
   * Claims one template across several days in one go, at `locationIds`
   * (`[]` = none). A day already claimed gets any new locations added.
   */
  claimTemplate: (
    templateId: UUID,
    dates: string[],
    userId: UUID,
    locationIds: UUID[],
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
  const [locations, setLocations] = useState<Location[]>([])
  const [locationsAvailable, setLocationsAvailable] = useState(true)
  const [locationsLoaded, setLocationsLoaded] = useState(false)
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
      const [[nextProfiles, nextTemplates], nextLocations] = await Promise.all([
        Promise.all([backend.listProfiles(), backend.listTemplates()]),
        // Nơi trực tải riêng: lỗi ở đây không được kéo hỏng cả nhân viên lẫn ca
        // mẫu. Ví dụ vừa lên bản mới mà đang offline — bộ đệm IndexedDB có
        // sẵn 'profiles' / 'templates' của bản cũ nhưng chưa có 'locations'.
        backend.listLocations().catch(() => undefined),
      ])
      if (!mounted.current) return
      setProfiles(nextProfiles)
      // null means the templates migration hasn't been run.
      setTemplatesAvailable(nextTemplates !== null)
      setTemplates(nextTemplates ?? [])
      // null: 012 chưa chạy. undefined: tải lỗi — giữ danh sách đang có.
      if (nextLocations !== undefined) {
        setLocationsAvailable(nextLocations !== null)
        setLocations(sortLocations(nextLocations ?? []))
        setLocationsLoaded(true)
      }
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

  const updateProfile = useCallback(
    async (id: UUID, input: ProfileInput) => {
      await backend.updateProfile(id, input)
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

  const createLocation = useCallback(
    async (input: LocationInput) => {
      await backend.createLocation(input)
      await refresh()
    },
    [refresh],
  )

  const updateLocation = useCallback(
    async (id: UUID, input: LocationInput) => {
      await backend.updateLocation(id, input)
      await refresh()
    },
    [refresh],
  )

  const deleteLocation = useCallback(
    async (id: UUID) => {
      await backend.deleteLocation(id)
      await refresh()
    },
    [refresh],
  )

  const claimTemplate = useCallback(
    async (
      templateId: UUID,
      dates: string[],
      userId: UUID,
      locationIds: UUID[],
    ) => {
      // Sequential rather than parallel: each day may have to create the
      // shift first, and the unique index would reject a burst of inserts.
      // One refresh at the end instead of one per day.
      try {
        for (const date of dates) {
          await backend.claimTemplate(templateId, date, userId, locationIds)
        }
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  const shiftDateBounds = useCallback(
    (userIds: UUID[]) => backend.shiftDateBounds(userIds),
    [],
  )
  const fetchShift = useCallback(
    async (id: UUID) =>
      // Id sai dạng (link gõ tay) thì coi như không có ca, đừng để Supabase
      // trả lỗi cú pháp uuid.
      isRecordId(id)
        ? ((await backend.listShifts({ kind: 'shift', shiftId: id }))[0] ?? null)
        : null,
    [],
  )
  const cachedShift = useCallback((id: UUID) => store.findShift(id), [store])

  const profilesById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles],
  )
  const rosterProfiles = useMemo(() => profiles.filter(isListed), [profiles])
  // Cột chưa có thì mọi dòng đều đọc về null.
  const accountsAvailable =
    profiles.length === 0 || profiles.some((p) => p.displayed !== null)

  const value = useMemo(
    () => ({
      store,
      profiles,
      profilesById,
      rosterProfiles,
      accountsAvailable,
      templates,
      templatesAvailable,
      locations,
      locationsAvailable,
      locationsLoaded,
      loading,
      error,
      refresh,
      shiftDateBounds,
      fetchShift,
      cachedShift,
      dataVersion,
      createShift,
      updateShift,
      deleteShift,
      updateProfile,
      setAssignmentStatus,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      createLocation,
      updateLocation,
      deleteLocation,
      claimTemplate,
    }),
    [
      store,
      profiles,
      profilesById,
      rosterProfiles,
      accountsAvailable,
      templates,
      templatesAvailable,
      locations,
      locationsAvailable,
      locationsLoaded,
      loading,
      error,
      refresh,
      shiftDateBounds,
      fetchShift,
      cachedShift,
      dataVersion,
      createShift,
      updateShift,
      deleteShift,
      updateProfile,
      setAssignmentStatus,
      createTemplate,
      updateTemplate,
      deleteTemplate,
      createLocation,
      updateLocation,
      deleteLocation,
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
