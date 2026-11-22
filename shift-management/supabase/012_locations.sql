-- =====================================================================
-- Shift Scheduler — migration 012: nơi trực (location) cho từng lượt
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 002, 003, 005, 008, 010 và 011 trước. Chạy lại nhiều lần vẫn an toàn.
-- Muốn gộp 6 ca mẫu cũ (page / discord) thành Sáng / Chiều / Tối thì chạy
-- tiếp 013_merge_location_templates.sql SAU file này.
--
-- Trước đây "trực page" và "trực discord" là hai ca mẫu riêng cùng giờ, nên
-- một người trực cả hai thì có hai lượt trùng giờ. Từ file này nơi trực gắn
-- vào TỪNG LƯỢT (người trong ca), một lượt có thể có nhiều nơi trực:
--
--   1. Bảng locations: danh sách nơi trực, chỉ admin thêm / sửa / ẩn / xoá
--      (trigger, như ca mẫu ở 008). Xoá bị chặn khi còn lượt đang dùng — kể cả
--      admin: mảng uuid không có khoá ngoại, chặn ở đây thay cho FK.
--   2. Cột shift_assignments.location_ids uuid[]: luôn là mảng không trùng, đã
--      sắp xếp (trigger chuẩn hoá cho mọi người), để "đổi hay không đổi" so
--      được bằng = và nhật ký không ghi những lần lưu lại y nguyên.
--   3. Luật cho nhân viên (ghi đè enforce_attendance_rules của 010):
--      - nơi trực mới thêm vào lượt phải tồn tại và đang hiện;
--      - lượt của người khác: không đổi nơi trực (luật D);
--      - lượt đã điểm danh: không đổi nơi trực (khoá cùng chỗ với giờ);
--      - điểm danh chỉ đổi trạng thái, không kèm đổi nơi trực (luật 3).
--      Lượt chưa điểm danh thì đổi nơi trực tự do, không phụ thuộc cửa sổ giờ.
--   4. Nhật ký (ghi đè record_action_log của 003): thao tác trên nơi trực,
--      tên nơi trực trong câu "Nhận ca" / "Thêm ... vào ca" (để ô tìm kiếm
--      nhật ký tìm được), metadata location_names.
-- =====================================================================

do $$
begin
  if to_regclass('public.shift_templates') is null then
    raise exception 'Chạy 002_shift_templates.sql trước migration này.';
  end if;
  if to_regclass('public.action_logs') is null then
    raise exception 'Chạy 003_action_logs.sql trước migration này.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
  if to_regprocedure('public.enforce_template_admin()') is null then
    raise exception 'Chạy 008_template_admin.sql trước migration này.';
  end if;
  if to_regprocedure('public.attendance_window_started(date, time, timestamptz)') is null then
    raise exception 'Chạy 010_harden_rules.sql trước migration này.';
  end if;
  if to_regprocedure('public.list_accounts()') is null then
    raise exception 'Chạy 011_accounts_private.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. BẢNG NƠI TRỰC
-- ---------------------------------------------------------------------

create table if not exists public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Khoá màu trong PALETTE của frontend (src/lib/colors.ts), như ca mẫu (004).
  color      text,
  -- Thứ tự hiện chip; bằng nhau thì theo tên.
  sort_order integer not null default 0,
  -- Ẩn thay vì xoá: lượt cũ vẫn hiện tên, nhưng không chọn mới được nữa.
  is_active  boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ràng buộc viết riêng (drop rồi add) để chạy lại file là cập nhật được.
alter table public.locations drop constraint if exists locations_name_valid;
alter table public.locations add constraint locations_name_valid
  check (length(btrim(name)) between 1 and 50 and length(name) <= 50);

alter table public.locations drop constraint if exists locations_color_format;
alter table public.locations add constraint locations_color_format
  check (color is null or color ~ '^[a-z]{1,20}$');

-- Hai nơi trực trùng tên (khác hoa / thường) thì chip không phân biệt được.
-- Trùng thì Postgres báo 23505 với tên chỉ mục này.
create unique index if not exists locations_name_lower_unique
  on public.locations (lower(name));

-- ---------------------------------------------------------------------
-- 2. CỘT location_ids TRÊN LƯỢT PHÂN CÔNG
-- ---------------------------------------------------------------------
-- Mảng chứ không bảng nối: một lượt hiếm khi quá 2–3 nơi trực, và một lệnh
-- ghi lượt = một dòng nhật ký (bảng nối sẽ thành nhiều dòng). Đổi lại không
-- có FK, nên xoá nơi trực đang dùng bị chặn bằng trigger ở mục 4.

alter table public.shift_assignments
  add column if not exists location_ids uuid[] not null default '{}';

alter table public.shift_assignments drop constraint if exists shift_assignments_location_ids_valid;
alter table public.shift_assignments add constraint shift_assignments_location_ids_valid
  check (cardinality(location_ids) <= 10 and array_position(location_ids, null) is null);

-- Cho phép kiểm tra "còn lượt nào dùng nơi trực này" (@>) không quét cả bảng.
create index if not exists shift_assignments_location_ids_idx
  on public.shift_assignments using gin (location_ids);

-- ---------------------------------------------------------------------
-- 3. CHUẨN HOÁ MẢNG NƠI TRỰC
-- ---------------------------------------------------------------------
-- Bỏ null, bỏ trùng, sắp xếp tăng dần theo uuid (thứ tự byte = thứ tự chuỗi
-- hex chữ thường, nên client sắp xếp chuỗi là ra cùng kết quả). Dùng trong
-- trigger ở mục 5 và trong 013 (lúc đó trigger bị tắt).

create or replace function public.normalize_location_ids(p uuid[])
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select array(
    select distinct x
    from unnest(p) as u(x)
    where x is not null
    order by x
  );
$$;

-- ---------------------------------------------------------------------
-- 4. CHỈ ADMIN SỬA NƠI TRỰC; KHÔNG XOÁ NƠI TRỰC ĐANG DÙNG
-- ---------------------------------------------------------------------
-- Trigger chứ không RLS, cùng lý do như 008: RLS từ chối UPDATE / DELETE thì
-- Supabase không báo lỗi mà lặng lẽ sửa 0 dòng.

create or replace function public.enforce_location_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bạn không có quyền sửa nơi trực.'
      using errcode = '42501';
  end if;

  if TG_OP = 'DELETE' then
    -- Áp cho cả admin: xoá đi thì các lượt cũ còn id trỏ vào khoảng không.
    -- Ẩn (is_active = false) giữ được tên trên lịch sử.
    if exists (
      select 1 from public.shift_assignments a
      where a.location_ids @> array[OLD.id]
    ) then
      raise exception 'Nơi trực đang được dùng — hãy ẩn thay vì xoá.'
        using errcode = '23503';
    end if;
    return OLD;
  end if;

  -- " Fanpage" và "Fanpage" không được thành hai nơi trực.
  NEW.name := btrim(NEW.name);
  return NEW;
end;
$$;

drop trigger if exists locations_admin_only on public.locations;
create trigger locations_admin_only
  before insert or update or delete on public.locations
  for each row execute function public.enforce_location_admin();

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. LUẬT TRÊN PHÂN CÔNG (thay bản của 010)
-- ---------------------------------------------------------------------
-- Giữ nguyên toàn bộ bản 010, thêm phần đánh dấu "-- 012".

create or replace function public.enforce_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_me    uuid    := auth.uid();
  v_date  date;
begin
  if TG_OP = 'DELETE' then
    if v_admin then
      return OLD;
    end if;
    -- Ca cha đã biến mất: dòng này bị cascade xoá theo khi xoá cả ca, và
    -- luật xoá ca (enforce_shift_rules) đã quyết định cho phép rồi.
    if not exists (select 1 from public.shifts s where s.id = OLD.shift_id) then
      return OLD;
    end if;
    perform public.assert_can_remove_assignment(OLD);
    return OLD;
  end if;

  -- 012. Chuẩn hoá cho mọi người (cả admin): so sánh đổi / không đổi bên
  -- dưới và trong nhật ký mới ổn định. Client gửi null thì coi như rỗng.
  NEW.location_ids := coalesce(public.normalize_location_ids(NEW.location_ids), '{}');

  -- 7. Khoá dòng ca cha trước khi xét gì. Luật E / F đếm người trong ca lúc
  -- sửa / xoá ca; không khoá thì một lượt đang thêm dở, chưa commit, sẽ không
  -- được đếm. Sửa / xoá ca cũng khoá dòng này, nên hai bên xếp hàng.
  select s.date into v_date
  from public.shifts s
  where s.id = NEW.shift_id
  for no key update;

  if not v_admin then
    -- 1. Mốc thời gian không nhận từ client.
    if TG_OP = 'INSERT' then
      NEW.created_at := now();
      NEW.updated_at := now();
    else
      NEW.created_at := OLD.created_at;
    end if;

    -- D. Lượt của người khác (như 006, thêm nơi trực).
    if TG_OP = 'UPDATE' and OLD.user_id is distinct from v_me and (
         NEW.user_id      is distinct from OLD.user_id
      or NEW.shift_id     is distinct from OLD.shift_id
      or NEW.start_time   is distinct from OLD.start_time
      or NEW.end_time     is distinct from OLD.end_time
      or NEW.status       is distinct from OLD.status
      or NEW.note         is distinct from OLD.note
      or NEW.location_ids is distinct from OLD.location_ids
    ) then
      raise exception 'Bạn không có quyền sửa lượt của người khác.'
        using errcode = '42501';
    end if;

    -- C. Thêm người khác (như 006).
    if NEW.user_id is distinct from v_me
       and (TG_OP = 'INSERT' or NEW.user_id is distinct from OLD.user_id) then
      raise exception 'Bạn không có quyền thêm người khác vào ca.'
        using errcode = '42501';
    end if;

    if TG_OP = 'INSERT' then
      -- 3. Thêm vào ca trước, điểm danh là một lệnh riêng.
      if NEW.status = 'confirmed' then
        raise exception 'Bạn không có quyền điểm danh lúc thêm vào ca: thêm vào ca trước rồi mới điểm danh.'
          using errcode = '42501';
      end if;
    else
      -- 4. Không chuyển lượt, không đổi id.
      if NEW.id is distinct from OLD.id then
        raise exception 'Bạn không có quyền đổi mã của lượt phân công.'
          using errcode = '42501';
      end if;
      if NEW.shift_id is distinct from OLD.shift_id then
        raise exception 'Bạn không có quyền chuyển lượt sang ca khác.'
          using errcode = '42501';
      end if;

      if OLD.status <> 'confirmed' then
        -- G. Lượt đã điểm danh có câu báo riêng ở dưới.
        if (NEW.start_time is distinct from OLD.start_time
            or NEW.end_time is distinct from OLD.end_time)
           and public.attendance_window_started(v_date, OLD.start_time) then
          raise exception 'Bạn không có quyền sửa giờ khi đã tới giờ điểm danh — cần sửa thì nhắn admin.'
            using errcode = '42501';
        end if;

        -- 3. Điểm danh chỉ đổi mỗi trạng thái (012: kể cả nơi trực), để
        -- nhật ký luôn ghi đúng là "điểm danh".
        if NEW.status = 'confirmed' and (
             NEW.start_time   is distinct from OLD.start_time
          or NEW.end_time     is distinct from OLD.end_time
          or NEW.note         is distinct from OLD.note
          or NEW.location_ids is distinct from OLD.location_ids
        ) then
          raise exception 'Bạn không có quyền vừa điểm danh vừa sửa lượt: lưu thay đổi trước rồi mới điểm danh.'
            using errcode = '42501';
        end if;
      elsif NEW.location_ids is distinct from OLD.location_ids then
        -- 012. Đã điểm danh là đã trực ở đâu xong: khoá cùng chỗ với giờ.
        raise exception 'Bạn không có quyền sửa nơi trực của lượt đã điểm danh.'
          using errcode = '42501';
      end if;
    end if;

    -- 012. Nơi trực MỚI THÊM vào lượt phải tồn tại và đang hiện. Chỉ xét phần
    -- mới thêm: lượt cũ đang mang một nơi trực vừa bị ẩn thì vẫn lưu được
    -- (sửa giờ, thêm nơi trực khác) mà không bị buộc bỏ nơi trực đó.
    if TG_OP = 'INSERT' or NEW.location_ids is distinct from OLD.location_ids then
      if exists (
        select 1
        from unnest(NEW.location_ids) as u(id)
        where (TG_OP = 'INSERT' or not (u.id = any (OLD.location_ids)))
          and not exists (
            select 1 from public.locations l
            where l.id = u.id and l.is_active
          )
      ) then
        raise exception 'Nơi trực không tồn tại hoặc đã bị ẩn.'
          using errcode = '22023';
      end if;
    end if;
  end if;

  if TG_OP = 'UPDATE' and OLD.status = 'confirmed' then
    if NEW.status = 'confirmed' then
      if not v_admin and (
           NEW.start_time <> OLD.start_time
        or NEW.end_time   <> OLD.end_time
        or NEW.user_id    <> OLD.user_id
        or NEW.shift_id   <> OLD.shift_id
      ) then
        raise exception 'Bạn không có quyền sửa giờ của lượt đã điểm danh.'
          using errcode = '42501';
      end if;
      NEW.confirmed_at := OLD.confirmed_at;
    else
      if not v_admin then
        raise exception 'Bạn không có quyền bỏ điểm danh.'
          using errcode = '42501';
      end if;
      NEW.confirmed_at := null;
    end if;
    return NEW;
  end if;

  -- Từ đây: dòng mới, hoặc dòng đang chờ xác nhận.
  if NEW.status <> 'confirmed' then
    NEW.confirmed_at := null;
    return NEW;
  end if;

  if not v_admin then
    if NEW.user_id is distinct from v_me then
      raise exception 'Bạn không có quyền điểm danh cho người khác.'
        using errcode = '42501';
    end if;

    if not public.attendance_window_open(v_date, NEW.start_time, NEW.end_time) then
      raise exception
        'Bạn không có quyền điểm danh ngoài giờ: chỉ từ 30 phút trước giờ bắt đầu đến giờ kết thúc của bạn.'
        using errcode = '42501';
    end if;
  end if;

  NEW.confirmed_at := now();
  return NEW;
end;
$$;

-- Trigger giữ tên của 005; tạo lại cho chắc nó trỏ đúng hàm.
drop trigger if exists shift_assignments_attendance on public.shift_assignments;
create trigger shift_assignments_attendance
  before insert or update or delete on public.shift_assignments
  for each row execute function public.enforce_attendance_rules();

-- ---------------------------------------------------------------------
-- 6. NHẬT KÝ (thay bản của 003)
-- ---------------------------------------------------------------------
-- Chép nguyên bản 003, thêm phần đánh dấu "-- 012":
--   - nhánh bảng locations (entity_type 'location');
--   - tên nơi trực trong câu Nhận ca / Thêm vào ca, metadata location_names;
--   - "đổi trạng thái" chỉ khi nơi trực cũng không đổi;
--   - danh sách người bị gỡ khi xoá ca có location_ids;
--   - template.toggled so thêm màu (trước đây chỉ đổi màu + bật / tắt cùng
--     lúc vẫn bị ghi là "Bật / Tắt ca mẫu", mất dấu việc đổi màu).
-- Vẫn là trigger AFTER (trừ xoá ca là BEFORE), giá trị trả về bị bỏ qua.

create or replace function public.record_action_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor      uuid := auth.uid();
  v_email      text;
  v_name       text;
  v_action     text;
  v_entity     text;
  v_entity_id  uuid;
  v_summary    text;
  v_old        jsonb;
  v_new        jsonb;
  v_meta       jsonb := '{}'::jsonb;

  v_shift_id     uuid;
  v_shift_title  text;
  v_shift_date   date;
  v_template_id  uuid;
  v_target_name  text;

  -- Người này có phải người đầu tiên nhận ca đó không, tức ca vừa được tạo
  -- ra bởi chính cú bấm Nhận ca này.
  v_first_claim  boolean;
  v_shift_row    jsonb;

  -- Danh sách nhân viên đang trong ca, chụp lại lúc xoá ca.
  v_roster       jsonb;
  v_roster_count bigint;
  v_roster_names text;
  -- Ca cha còn tồn tại không — dùng để phân biệt người dùng chủ động gỡ một
  -- người, với việc cascade gỡ hàng loạt do xoá cả ca.
  v_shift_exists boolean;

  -- 012. Tên nơi trực của lượt, theo thứ tự hiện chip (sort_order, tên).
  -- id lạ (nơi trực đã xoá) thì bỏ qua.
  v_loc_ids      uuid[];
  v_loc_names    jsonb;
  v_loc_text     text;
begin
  -- Ảnh chụp thông tin người thực hiện.
  if v_actor is not null then
    select p.email, p.display_name into v_email, v_name
    from public.profiles p
    where p.id = v_actor;
  end if;

  v_old := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end;
  v_new := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end;

  -- ------------------------------------------------ shifts
  if TG_TABLE_NAME = 'shifts' then
    v_entity := 'shift';

    if TG_OP = 'DELETE' then
      -- Chạy ở BEFORE DELETE nên các phân công vẫn còn — liệt kê được ai đang
      -- trong ca. Ở AFTER thì cascade đã xoá sạch, không còn gì để liệt kê.
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'assignment_id', a.id,
              'user_id',       a.user_id,
              'name',          p.display_name,
              'start_time',    a.start_time,
              'end_time',      a.end_time,
              'status',        a.status,
              'note',          a.note,
              'location_ids',  a.location_ids   -- 012
            )
            order by a.start_time
          ),
          '[]'::jsonb
        ),
        count(*),
        string_agg(coalesce(p.display_name, '?'), ', ' order by a.start_time)
      into v_roster, v_roster_count, v_roster_names
      from public.shift_assignments a
      left join public.profiles p on p.id = a.user_id
      where a.shift_id = OLD.id;

      v_entity_id := OLD.id;
      v_action    := 'shift.deleted';
      v_summary   := format('Xoá ca %s (%s %s-%s)%s',
                       OLD.title, OLD.date, OLD.start_time, OLD.end_time,
                       case when coalesce(v_roster_count, 0) > 0
                            then format(' — gỡ %s nhân viên: %s',
                                   v_roster_count, v_roster_names)
                            else ' — ca đang trống' end);
      v_meta := jsonb_build_object(
        'shift_title',   OLD.title,
        'shift_date',    OLD.date,
        'staff_count',   coalesce(v_roster_count, 0),
        'staff_removed', coalesce(v_roster, '[]'::jsonb)
      );

    elsif TG_OP = 'INSERT' then
      -- Ca sinh ra từ việc nhận ca mẫu KHÔNG có dòng log riêng: dòng "Nhận ca"
      -- ngay sau đây ghi lại cả việc ca này được tạo mới, kèm dữ liệu đầy đủ.
      -- Một cú bấm = một dòng nhật ký.
      if NEW.template_id is not null then
        return null;
      end if;

      v_entity_id := NEW.id;
      v_action    := 'shift.created';
      v_summary   := format('Tạo ca %s (%s %s-%s)',
                       NEW.title, NEW.date, NEW.start_time, NEW.end_time);
      v_meta := jsonb_build_object(
        'shift_title', NEW.title,
        'shift_date',  NEW.date
      );

    else
      -- updated_at đổi ở mọi lần UPDATE nên không tính là thay đổi thật.
      if v_old - 'updated_at' = v_new - 'updated_at' then
        return null;
      end if;

      v_entity_id := NEW.id;
      v_action    := 'shift.updated';
      v_summary   := format('Sửa ca %s (%s %s-%s)',
                       NEW.title, NEW.date, NEW.start_time, NEW.end_time);
      v_meta := jsonb_build_object(
        'shift_title', NEW.title,
        'shift_date',  NEW.date
      );
    end if;

  -- ------------------------------------- shift_assignments
  elsif TG_TABLE_NAME = 'shift_assignments' then
    v_entity := 'assignment';
    v_shift_id := coalesce(NEW.shift_id, OLD.shift_id);
    v_entity_id := coalesce(NEW.id, OLD.id);

    -- Khi xoá ca, ca đã biến mất trước khi cascade tới đây, nên có thể không
    -- tra được. Để null và mô tả bằng dữ liệu còn lại.
    select s.title, s.date, s.template_id
      into v_shift_title, v_shift_date, v_template_id
    from public.shifts s
    where s.id = v_shift_id;
    v_shift_exists := FOUND;

    select p.display_name into v_target_name
    from public.profiles p
    where p.id = coalesce(NEW.user_id, OLD.user_id);

    -- 012. Nơi trực hiện tại của lượt (lúc xoá thì là của dòng bị xoá).
    v_loc_ids := case when TG_OP = 'DELETE' then OLD.location_ids
                      else NEW.location_ids end;
    select
      coalesce(jsonb_agg(l.name order by l.sort_order, l.name), '[]'::jsonb),
      string_agg(l.name, ', ' order by l.sort_order, l.name)
    into v_loc_names, v_loc_text
    from public.locations l
    where l.id = any (coalesce(v_loc_ids, '{}'));

    v_meta := jsonb_build_object(
      'shift_id',       v_shift_id,
      'shift_title',    v_shift_title,
      'shift_date',     v_shift_date,
      'target_user_id', coalesce(NEW.user_id, OLD.user_id),
      'target_name',    v_target_name,
      'self',           coalesce(NEW.user_id, OLD.user_id) = v_actor,
      'location_names', coalesce(v_loc_names, '[]'::jsonb)   -- 012
    );

    if TG_OP = 'INSERT' then
      -- Tự nhận một ca sinh ra từ ca mẫu = "nhận ca", tách riêng để lọc được.
      if NEW.user_id = v_actor and v_template_id is not null then
        -- Không có ai khác trong ca nghĩa là ca này vừa được tạo ra bởi chính
        -- cú bấm Nhận ca đang xử lý. Trigger trên bảng shifts đã cố ý bỏ qua,
        -- nên dòng này phải mang đủ thông tin về việc tạo ca.
        select not exists (
          select 1
          from public.shift_assignments a
          where a.shift_id = v_shift_id
            and a.id <> NEW.id
        ) into v_first_claim;

        select to_jsonb(s) into v_shift_row
        from public.shifts s
        where s.id = v_shift_id;

        v_action  := 'assignment.claimed';
        v_summary := format('Nhận ca %s ngày %s (%s-%s)',
                       coalesce(v_shift_title, '?'),
                       coalesce(v_shift_date::text, '?'),
                       NEW.start_time, NEW.end_time)
                     -- 012. Ô tìm nhật ký tìm theo summary (ilike).
                     || coalesce(' — ' || v_loc_text, '');
        v_meta := v_meta || jsonb_build_object(
          'template_id',   v_template_id,
          'shift_created', coalesce(v_first_claim, false),
          'shift_snapshot', v_shift_row
        );
      else
        v_action  := 'assignment.created';
        v_summary := format('Thêm %s vào ca %s ngày %s (%s-%s)',
                       coalesce(v_target_name, '?'),
                       coalesce(v_shift_title, '?'),
                       coalesce(v_shift_date::text, '?'),
                       NEW.start_time, NEW.end_time)
                     || coalesce(' — ' || v_loc_text, '');   -- 012
      end if;

    elsif TG_OP = 'DELETE' then
      -- Ca cha đã biến mất nghĩa là dòng này bị cascade xoá theo khi người
      -- dùng xoá cả ca. Đó không phải một thao tác riêng: dòng "Xoá ca" đã
      -- liệt kê đầy đủ ai đang trong ca. Ca còn tồn tại thì mới là người dùng
      -- thật sự gỡ một người ra.
      if not v_shift_exists then
        return null;
      end if;

      v_action  := 'assignment.deleted';
      v_summary := format('Gỡ %s khỏi ca %s ngày %s',
                     coalesce(v_target_name, '?'),
                     coalesce(v_shift_title, '?'),
                     coalesce(v_shift_date::text, '?'));

    else
      if v_old - 'updated_at' = v_new - 'updated_at' then
        return null;
      end if;

      -- Chỉ đổi mỗi trạng thái thì ghi thành hành động riêng, vì "xác nhận ca"
      -- là việc cần audit rõ. 012: đổi nơi trực cùng lúc thì là "sửa".
      if OLD.status is distinct from NEW.status
         and OLD.start_time = NEW.start_time
         and OLD.end_time   = NEW.end_time
         and OLD.user_id    = NEW.user_id
         and OLD.note is not distinct from NEW.note
         and OLD.location_ids is not distinct from NEW.location_ids then
        v_action  := 'assignment.status_changed';
        v_summary := format('Đổi trạng thái của %s trong ca %s ngày %s: %s -> %s',
                       coalesce(v_target_name, '?'),
                       coalesce(v_shift_title, '?'),
                       coalesce(v_shift_date::text, '?'),
                       OLD.status, NEW.status);
        v_meta := v_meta || jsonb_build_object(
          'old_status', OLD.status, 'new_status', NEW.status
        );
      else
        v_action  := 'assignment.updated';
        v_summary := format('Sửa phân công của %s trong ca %s ngày %s',
                       coalesce(v_target_name, '?'),
                       coalesce(v_shift_title, '?'),
                       coalesce(v_shift_date::text, '?'));
      end if;
    end if;

  -- -------------------------------------- shift_templates
  elsif TG_TABLE_NAME = 'shift_templates' then
    v_entity := 'template';
    v_entity_id := coalesce(NEW.id, OLD.id);
    v_meta := jsonb_build_object(
      'template_title', coalesce(NEW.title, OLD.title)
    );

    if TG_OP = 'INSERT' then
      v_action  := 'template.created';
      v_summary := format('Tạo ca mẫu %s (%s-%s)',
                     NEW.title, NEW.start_time, NEW.end_time);

    elsif TG_OP = 'DELETE' then
      v_action  := 'template.deleted';
      v_summary := format('Xoá ca mẫu %s', OLD.title);

    else
      if v_old - 'updated_at' = v_new - 'updated_at' then
        return null;
      end if;

      if OLD.is_active is distinct from NEW.is_active
         and OLD.title = NEW.title
         and OLD.start_time = NEW.start_time
         and OLD.end_time = NEW.end_time
         and OLD.weekdays = NEW.weekdays
         and OLD.note is not distinct from NEW.note
         and OLD.color is not distinct from NEW.color then   -- 012
        v_action  := 'template.toggled';
        v_summary := format('%s ca mẫu %s',
                       case when NEW.is_active then 'Bật' else 'Tắt' end,
                       NEW.title);
        v_meta := v_meta || jsonb_build_object('is_active', NEW.is_active);
      else
        v_action  := 'template.updated';
        v_summary := format('Sửa ca mẫu %s', NEW.title);
      end if;
    end if;

  -- -------------------------------------------- locations (012)
  elsif TG_TABLE_NAME = 'locations' then
    v_entity := 'location';
    v_entity_id := coalesce(NEW.id, OLD.id);
    v_meta := jsonb_build_object(
      'location_name', coalesce(NEW.name, OLD.name)
    );

    if TG_OP = 'INSERT' then
      v_action  := 'location.created';
      v_summary := format('Tạo nơi trực %s', NEW.name);

    elsif TG_OP = 'DELETE' then
      v_action  := 'location.deleted';
      v_summary := format('Xoá nơi trực %s', OLD.name);

    else
      if v_old - 'updated_at' = v_new - 'updated_at' then
        return null;
      end if;

      -- Ẩn / hiện là thao tác riêng chỉ khi KHÔNG có gì khác đổi theo. So cả
      -- dòng dạng JSON để cột thêm sau này cũng được tính.
      if OLD.is_active is distinct from NEW.is_active
         and v_old - 'updated_at' - 'is_active' = v_new - 'updated_at' - 'is_active' then
        v_action  := 'location.toggled';
        v_summary := format('%s nơi trực %s',
                       case when NEW.is_active then 'Hiện' else 'Ẩn' end,
                       NEW.name);
        v_meta := v_meta || jsonb_build_object('is_active', NEW.is_active);
      else
        v_action  := 'location.updated';
        v_summary := format('Sửa nơi trực %s', NEW.name);
      end if;
    end if;

  else
    -- Bảng lạ: vẫn ghi lại thay vì im lặng bỏ qua.
    v_entity := TG_TABLE_NAME;
    v_action := TG_TABLE_NAME || '.' || lower(TG_OP);
  end if;

  insert into public.action_logs (
    actor_id, actor_email, actor_name,
    action, entity_type, entity_id,
    summary, old_data, new_data, metadata
  ) values (
    v_actor, v_email, v_name,
    v_action, v_entity, v_entity_id,
    v_summary, v_old, v_new, v_meta
  );

  -- Ở trigger BEFORE, trả null sẽ HUỶ chính thao tác đang chạy. Chỉ trigger
  -- AFTER mới được phép trả null.
  if TG_WHEN = 'BEFORE' then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  return null;
end;
$$;

-- AFTER: chỉ ghi khi thao tác đã thành công thật (qua được trigger admin).
drop trigger if exists locations_action_log on public.locations;
create trigger locations_action_log
  after insert or update or delete on public.locations
  for each row execute function public.record_action_log();

-- ---------------------------------------------------------------------
-- 7. QUYỀN TRÊN BẢNG
-- ---------------------------------------------------------------------
-- Như ca mẫu (002): anon không có gì, mọi người đã đăng nhập đọc được (cả nơi
-- trực đang ẩn — lượt cũ vẫn cần hiện tên). Ghi thì policy mở, trigger ở mục
-- 4 mới là chỗ chặn người không phải admin.

alter table public.locations enable row level security;

revoke all on public.locations from anon;
-- API không dùng tới các quyền này; TRUNCATE còn bỏ qua cả RLS lẫn trigger.
revoke truncate, references, trigger on public.locations from authenticated;

drop policy if exists "locations: authenticated can read" on public.locations;
create policy "locations: authenticated can read"
  on public.locations for select
  to authenticated
  using (true);

drop policy if exists "locations: authenticated can insert" on public.locations;
create policy "locations: authenticated can insert"
  on public.locations for insert
  to authenticated
  with check (true);

drop policy if exists "locations: authenticated can update" on public.locations;
create policy "locations: authenticated can update"
  on public.locations for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "locations: authenticated can delete" on public.locations;
create policy "locations: authenticated can delete"
  on public.locations for delete
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 8. REALTIME
-- ---------------------------------------------------------------------
-- Admin đổi tên / màu thì màn hình của mọi người đổi theo. Chạy lại file thì
-- bảng đã nằm trong publication (42710 duplicate_object) — bỏ qua.

do $$
begin
  alter publication supabase_realtime add table public.locations;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'Không có publication supabase_realtime — bỏ qua realtime cho locations.';
end;
$$;

alter table public.locations replica identity full;

-- ---------------------------------------------------------------------
-- 9. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
-- Như 010: Supabase mặc định cho mọi người gọi hàm trong public qua
-- /rest/v1/rpc. Trigger chạy không cần quyền EXECUTE của người gọi nên thu
-- hết không ảnh hưởng gì.

revoke execute on function public.normalize_location_ids(uuid[]) from public, anon, authenticated;
revoke execute on function public.enforce_location_admin()        from public, anon, authenticated;
revoke execute on function public.enforce_attendance_rules()      from public, anon, authenticated;
revoke execute on function public.record_action_log()             from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. TỰ KIỂM TRA
-- ---------------------------------------------------------------------

do $$
declare
  a uuid := '00000000-0000-0000-0000-00000000000a';
  b uuid := '00000000-0000-0000-0000-00000000000b';
begin
  assert public.normalize_location_ids(array[b, a, b, null]) = array[a, b];
  assert public.normalize_location_ids(array[a]) = array[a];
  assert public.normalize_location_ids('{}') = '{}'::uuid[];
  assert public.normalize_location_ids(null) = '{}'::uuid[];
  -- Thứ tự uuid trong Postgres trùng thứ tự chuỗi hex chữ thường (client dựa
  -- vào điều này để chuẩn hoá giống hệt).
  assert public.normalize_location_ids(array[
    'f0000000-0000-0000-0000-000000000000'::uuid,
    '10000000-0000-0000-0000-00000000000f'::uuid
  ]) = array[
    '10000000-0000-0000-0000-00000000000f'::uuid,
    'f0000000-0000-0000-0000-000000000000'::uuid
  ];

  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shift_assignments'
      and column_name = 'location_ids'
  ), 'Thiếu cột shift_assignments.location_ids';
end;
$$;
