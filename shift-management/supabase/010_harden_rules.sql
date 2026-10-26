-- =====================================================================
-- Shift Scheduler — migration 010: bịt các đường lách luật khi gọi thẳng API
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 002, 005 và 006 trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Nhân viên không đi qua giao diện mà gọi thẳng Supabase API (chỉ cần
-- publishable key + phiên đăng nhập của chính họ) lách được vài luật của
-- 005 / 006. File này đóng các đường đó. Admin vẫn được miễn như cũ.
--
--   1. Mốc thời gian do máy chủ đặt. shift_assignments.created_at là mốc của
--      luật A (rời ca trong 30 phút) và F (xoá ca chỉ có mình), nhưng client
--      tự gửi được: gửi năm 2099 là rời ca lúc nào cũng được. shifts.created_by
--      / created_at cũng tự gửi được (mạo danh người tạo ca).
--   2. Luật G — tới giờ điểm danh thì giờ của mình đứng yên. Cửa sổ điểm danh
--      tính theo giờ của chính lượt đó, mà lượt chưa điểm danh thì sửa giờ
--      được: sửa thành 00:00–23:59 rồi điểm danh lúc 23:00 cho ca sáng đã bỏ
--      là điểm danh trễ. Nay từ lúc cửa sổ mở (30 phút trước giờ vào) thì
--      không sửa giờ vào / ra của lượt đó, không dời ngày ca chứa nó nữa.
--   3. Điểm danh chỉ là đổi trạng thái một lượt đã có: không thêm lượt mới ở
--      trạng thái đã xác nhận, không vừa điểm danh vừa sửa giờ / ghi chú —
--      nhờ vậy nhật ký luôn ghi đúng là "điểm danh".
--   4. Không chuyển lượt sang ca khác, không đổi id của lượt / ca. Giao diện
--      không bao giờ làm vậy; nhật ký chỉ ghi được ca đích, mất dấu ca cũ.
--   5. Ca sinh từ ca mẫu: tên và giờ lúc tạo lấy theo ca mẫu, giờ và ca mẫu
--      gốc về sau không sửa được. Trước đây tạo được "ca mẫu" với giờ tuỳ ý,
--      người nhận sau bị nhập vào ca giả đó.
--   6. Một người chỉ một lượt trong một ca. Trước đây điểm danh hai lượt trùng
--      giờ là nhân đôi số công.
--   7. Khoá dòng ca khi xét luật: hai lệnh gửi cùng lúc không lọt qua luật E / F.
--   8. Thu quyền gọi hàm qua /rest/v1/rpc của anon (Security Advisor báo),
--      thu quyền bảng thừa, giới hạn độ dài chữ.
--
-- Ghi đè hai hàm trigger của 006 (cùng tên). Trigger của ca thêm INSERT.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
  if to_regprocedure('public.assert_can_remove_assignment(public.shift_assignments)') is null then
    raise exception 'Chạy 006_shift_rules.sql trước migration này.';
  end if;
  if to_regclass('public.shift_templates') is null then
    raise exception 'Chạy 002_shift_templates.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. CỬA SỔ ĐIỂM DANH ĐÃ MỞ CHƯA
-- ---------------------------------------------------------------------
-- Cùng mốc với attendance_window_open (005) nhưng không có đầu cuối: đã mở
-- rồi thì kể cả khi đã đóng, giờ của lượt vẫn đứng yên (luật G).

create or replace function public.attendance_window_started(
  p_date  date,
  p_start time,
  p_now   timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone 'Asia/Ho_Chi_Minh')
         >= (p_date + p_start) - interval '30 minutes';
$$;

-- ---------------------------------------------------------------------
-- 2. LUẬT TRÊN PHÂN CÔNG (thay bản của 006)
-- ---------------------------------------------------------------------

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
    -- luật xoá ca (mục 3) đã quyết định cho phép rồi.
    if not exists (select 1 from public.shifts s where s.id = OLD.shift_id) then
      return OLD;
    end if;
    perform public.assert_can_remove_assignment(OLD);
    return OLD;
  end if;

  -- 7. Khoá dòng ca cha trước khi xét gì. Luật E / F (mục 3) đếm người trong
  -- ca lúc sửa / xoá ca; không khoá thì một lượt đang thêm dở, chưa commit,
  -- sẽ không được đếm. Sửa / xoá ca cũng khoá dòng này, nên hai bên xếp hàng.
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

    -- D. Lượt của người khác (như 006).
    if TG_OP = 'UPDATE' and OLD.user_id is distinct from v_me and (
         NEW.user_id    is distinct from OLD.user_id
      or NEW.shift_id   is distinct from OLD.shift_id
      or NEW.start_time is distinct from OLD.start_time
      or NEW.end_time   is distinct from OLD.end_time
      or NEW.status     is distinct from OLD.status
      or NEW.note       is distinct from OLD.note
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
      -- 4. Thay cho "chuyển ca = rời ca" của 006: giờ không chuyển được nữa.
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

        -- 3. Điểm danh chỉ đổi mỗi trạng thái.
        if NEW.status = 'confirmed' and (
             NEW.start_time is distinct from OLD.start_time
          or NEW.end_time   is distinct from OLD.end_time
          or NEW.note       is distinct from OLD.note
        ) then
          raise exception 'Bạn không có quyền vừa điểm danh vừa sửa lượt: lưu thay đổi trước rồi mới điểm danh.'
            using errcode = '42501';
        end if;
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

-- ---------------------------------------------------------------------
-- 3. LUẬT TRÊN CA (thay bản của 006)
-- ---------------------------------------------------------------------

create or replace function public.enforce_shift_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me        uuid := auth.uid();
  v_confirmed boolean;
  v_others    boolean;
  v_late      boolean;
  v_started   boolean;
  v_title     text;
  v_start     time;
  v_end       time;
begin
  if public.is_admin() then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    -- 1. Người tạo và mốc thời gian là của máy chủ.
    NEW.created_by := v_me;
    NEW.created_at := now();
    NEW.updated_at := now();
    -- 5. Ca mẫu: một ca mỗi ngày (unique trong 002), ai nhận sau cũng nhập
    -- vào ca này — nên tên và giờ phải đúng như ca mẫu.
    if NEW.template_id is not null then
      select t.title, t.start_time, t.end_time
        into v_title, v_start, v_end
      from public.shift_templates t
      where t.id = NEW.template_id;
      if found then
        NEW.title      := v_title;
        NEW.start_time := v_start;
        NEW.end_time   := v_end;
      end if;
    end if;
    return NEW;
  end if;

  select
    coalesce(bool_or(a.status = 'confirmed'), false),
    coalesce(bool_or(a.user_id is distinct from v_me), false),
    coalesce(bool_or(a.user_id = v_me
                     and a.created_at < now() - interval '30 minutes'), false),
    coalesce(bool_or(public.attendance_window_started(OLD.date, a.start_time)), false)
  into v_confirmed, v_others, v_late, v_started
  from public.shift_assignments a
  where a.shift_id = OLD.id;

  if TG_OP = 'DELETE' then
    if v_others then
      raise exception 'Bạn không có quyền xoá ca có người khác.'
        using errcode = '42501';
    end if;
    if v_confirmed then
      raise exception 'Bạn không có quyền xoá ca đã có người điểm danh.'
        using errcode = '42501';
    end if;
    -- F. Không rời được thì cũng không xoá được.
    if v_late then
      raise exception 'Bạn không có quyền xoá ca sau 30 phút kể từ lúc nhận.'
        using errcode = '42501';
    end if;
    return OLD;
  end if;

  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  if NEW.id is distinct from OLD.id then
    raise exception 'Bạn không có quyền đổi mã của ca.'
      using errcode = '42501';
  end if;

  -- E. Ca có người khác: tên / ngày / giờ thuộc về cả nhóm trong ca.
  -- Cố ý không xét `note`: ghi chú của ca luôn sửa được.
  if v_others and (
       NEW.title       is distinct from OLD.title
    or NEW.date        is distinct from OLD.date
    or NEW.start_time  is distinct from OLD.start_time
    or NEW.end_time    is distinct from OLD.end_time
    or NEW.template_id is distinct from OLD.template_id
  ) then
    raise exception 'Bạn không có quyền sửa tên, ngày và giờ của ca có người khác.'
      using errcode = '42501';
  end if;

  -- 5. Gắn ca thường vào ca mẫu là chiếm chỗ của ca mẫu ngày đó.
  if NEW.template_id is distinct from OLD.template_id then
    raise exception 'Bạn không có quyền đổi ca mẫu gốc của ca.'
      using errcode = '42501';
  end if;
  if OLD.template_id is not null and (
       NEW.start_time is distinct from OLD.start_time
    or NEW.end_time   is distinct from OLD.end_time
  ) then
    raise exception 'Bạn không có quyền sửa giờ của ca tạo từ ca mẫu.'
      using errcode = '42501';
  end if;

  if NEW.date <> OLD.date and v_confirmed then
    raise exception 'Bạn không có quyền đổi ngày của ca đã có người điểm danh.'
      using errcode = '42501';
  end if;
  -- G. Dời ngày là cách khác để mở lại cửa sổ điểm danh đã qua.
  if NEW.date <> OLD.date and v_started then
    raise exception 'Bạn không có quyền dời ca sang ngày khác khi đã tới giờ điểm danh.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists shifts_attendance on public.shifts;
create trigger shifts_attendance
  before insert or update or delete on public.shifts
  for each row execute function public.enforce_shift_rules();

-- ---------------------------------------------------------------------
-- 4. MỘT NGƯỜI MỘT LƯỢT TRONG MỘT CA
-- ---------------------------------------------------------------------
-- Giao diện vốn đã không cho thêm trùng. Báo lỗi ở đây nghĩa là đang có dòng
-- trùng — tìm bằng:
--   select shift_id, user_id, count(*) from public.shift_assignments
--   group by 1, 2 having count(*) > 1;

create unique index if not exists shift_assignments_shift_user_unique
  on public.shift_assignments (shift_id, user_id);

-- ---------------------------------------------------------------------
-- 5. ĐỘ DÀI CHỮ
-- ---------------------------------------------------------------------
-- Rộng hơn mọi thứ người dùng thật gõ; chỉ chặn việc gửi thẳng API hàng MB
-- chữ (mỗi lần ghi còn được chép thêm vào action_logs). `not valid`: dữ liệu
-- cũ không phải kiểm lại.

alter table public.shifts drop constraint if exists shifts_text_length;
alter table public.shifts add constraint shifts_text_length
  check (length(title) <= 200 and coalesce(length(note), 0) <= 2000) not valid;

alter table public.shift_assignments drop constraint if exists shift_assignments_text_length;
alter table public.shift_assignments add constraint shift_assignments_text_length
  check (coalesce(length(note), 0) <= 2000) not valid;

alter table public.shift_templates drop constraint if exists shift_templates_text_length;
alter table public.shift_templates add constraint shift_templates_text_length
  check (length(title) <= 200 and coalesce(length(note), 0) <= 2000) not valid;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (length(display_name) <= 100) not valid;

-- ---------------------------------------------------------------------
-- 6. QUYỀN
-- ---------------------------------------------------------------------
-- Supabase mặc định cho anon / authenticated gọi mọi hàm trong schema public
-- qua /rest/v1/rpc. Hàm trigger thì PostgREST không gọi được, còn is_admin()
-- trả true cho anon (auth.uid() null) — chưa lộ gì, nhưng là cái bẫy cho
-- policy viết sau. Trigger chạy không cần quyền EXECUTE của người gọi nên
-- thu hết không ảnh hưởng gì. Riêng is_admin() phải để cho authenticated:
-- policy "profiles: admin can update" gọi nó dưới quyền người gọi.
-- Hàm mới sau này cũng phải tự revoke như vậy (xem 009).

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

revoke execute on function public.attendance_window_open(date, time, time, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.attendance_window_started(date, time, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.assert_can_remove_assignment(public.shift_assignments)
  from public, anon, authenticated;

revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.set_updated_at()           from public, anon, authenticated;
revoke execute on function public.record_action_log()        from public, anon, authenticated;
revoke execute on function public.enforce_attendance_rules() from public, anon, authenticated;
revoke execute on function public.enforce_shift_rules()      from public, anon, authenticated;
revoke execute on function public.enforce_template_admin()   from public, anon, authenticated;
revoke execute on function public.protect_profile_role()     from public, anon, authenticated;
revoke execute on function public.protect_profile_fields()   from public, anon, authenticated;

-- Security Advisor: hàm không ghim search_path.
alter function public.set_updated_at() set search_path = '';

-- API không dùng tới các quyền này; TRUNCATE còn bỏ qua cả RLS lẫn trigger.
revoke truncate, references, trigger
  on public.profiles, public.shifts, public.shift_assignments, public.shift_templates
  from authenticated;
-- Profile do trigger handle_new_user tạo, xoá theo auth.users.
revoke insert, delete on public.profiles from authenticated;

-- ---------------------------------------------------------------------
-- 7. TỰ KIỂM TRA
-- ---------------------------------------------------------------------

do $$
begin
  -- Lượt 08:00 ngày 05/01/2026, giờ Việt Nam: mở từ 07:30, không bao giờ đóng lại.
  assert not public.attendance_window_started('2026-01-05', '08:00', '2026-01-05 07:29+07');
  assert     public.attendance_window_started('2026-01-05', '08:00', '2026-01-05 07:30+07');
  assert     public.attendance_window_started('2026-01-05', '08:00', '2026-01-06 23:00+07');
  -- Bẫy UTC: 00:30 UTC là 07:30 giờ Việt Nam.
  assert     public.attendance_window_started('2026-01-05', '08:00', '2026-01-05 00:30+00');
  assert not public.attendance_window_started('2026-01-05', '08:00', '2026-01-05 00:30+07');
end;
$$;
