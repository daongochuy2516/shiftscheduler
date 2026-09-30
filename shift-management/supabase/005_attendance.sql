-- =====================================================================
-- Shift Scheduler — migration 005: chấm công (vai trò + luật điểm danh)
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy schema.sql (001) trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Điểm danh = xác nhận: shift_assignments.status chuyển pending -> confirmed.
--
-- LUẬT CHO NHÂN VIÊN (role = 'staff')
--   1. Chỉ điểm danh lượt của chính mình.
--   2. Chỉ trong khoảng từ 30 phút trước giờ bắt đầu đến giờ kết thúc CỦA
--      RIÊNG MÌNH, tính theo đồng hồ máy chủ và múi giờ Asia/Ho_Chi_Minh.
--      Qua giờ kết thúc là hết cửa — không điểm danh trễ.
--   3. Lượt đã điểm danh bị khoá: không bỏ điểm danh, không sửa giờ / đổi
--      người, không gỡ khỏi ca.
--   4. Không xoá ca đã tạo quá 30 phút, và không xoá hay đổi ngày ca đã có
--      người điểm danh.
--
-- ADMIN (role = 'admin') và thao tác không có người dùng (SQL Editor,
-- service_role) không bị luật nào ở trên chặn.
--
-- SAU KHI CHẠY: mọi người đều là 'staff'. Phong admin bằng câu lệnh ở mục 7,
-- nếu không sẽ không còn ai sửa được lượt đã điểm danh.
--
-- Mọi luật nằm trong trigger, không phải ở giao diện: gọi thẳng Supabase API
-- cũng không lách được.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VAI TRÒ
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'staff';

alter table public.profiles
  drop constraint if exists profiles_role_valid;
alter table public.profiles
  add constraint profiles_role_valid check (role in ('staff', 'admin'));

-- Policy "profiles: update own" cho mỗi người sửa dòng của mình — nếu không
-- chặn ở đây thì ai cũng tự phong admin được. Chỉ thao tác không mang phiên
-- đăng nhập (SQL Editor, service_role) mới đổi được vai trò: không có đường
-- nào trong ứng dụng để tự phong.
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.role is distinct from OLD.role and auth.uid() is not null then
    raise exception 'Vai trò chỉ quản trị database mới đổi được.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Người gọi có được miễn luật không: admin, hoặc không có phiên đăng nhập.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
      or exists (
           select 1 from public.profiles p
           where p.id = auth.uid() and p.role = 'admin'
         );
$$;

-- ---------------------------------------------------------------------
-- 2. THỜI ĐIỂM ĐIỂM DANH
-- ---------------------------------------------------------------------
-- Do trigger ở mục 4 ghi, client gửi gì cũng bị ghi đè. Khác updated_at ở
-- chỗ nó không đổi khi sửa ghi chú — đủ để đối chiếu "điểm danh lúc 07:31
-- cho ca 08:00". Lượt đã xác nhận từ trước migration này để null.

alter table public.shift_assignments
  add column if not exists confirmed_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. CỬA SỔ ĐIỂM DANH
-- ---------------------------------------------------------------------
-- `date` và `time` không mang múi giờ; so thẳng với now() thì Postgres tính
-- theo UTC và lệch 7 tiếng. Đổi now() về giờ Việt Nam trước khi so.

create or replace function public.attendance_window_open(
  p_date  date,
  p_start time,
  p_end   time,
  p_now   timestamptz default now()
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_now at time zone 'Asia/Ho_Chi_Minh')
         between (p_date + p_start) - interval '30 minutes'
             and (p_date + p_end);
$$;

-- ---------------------------------------------------------------------
-- 4. LUẬT TRÊN PHÂN CÔNG
-- ---------------------------------------------------------------------

create or replace function public.enforce_attendance_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_date  date;
begin
  if TG_OP = 'DELETE' then
    if v_admin or OLD.status <> 'confirmed' then
      return OLD;
    end if;
    -- Xoá cả ca không bao giờ tới được đây với lượt đã điểm danh: trigger ở
    -- mục 5 chặn từ trước khi cascade chạy.
    raise exception 'Lượt này đã điểm danh — chỉ admin gỡ được.'
      using errcode = '42501';
  end if;

  if TG_OP = 'UPDATE' and OLD.status = 'confirmed' then
    if NEW.status = 'confirmed' then
      if not v_admin and (
           NEW.start_time <> OLD.start_time
        or NEW.end_time   <> OLD.end_time
        or NEW.user_id    <> OLD.user_id
        or NEW.shift_id   <> OLD.shift_id
      ) then
        raise exception 'Lượt này đã điểm danh — chỉ admin sửa được giờ.'
          using errcode = '42501';
      end if;
      NEW.confirmed_at := OLD.confirmed_at;
    else
      if not v_admin then
        raise exception 'Chỉ admin bỏ được điểm danh.'
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
    if NEW.user_id is distinct from auth.uid() then
      raise exception 'Chỉ điểm danh được ca của chính mình.'
        using errcode = '42501';
    end if;

    select s.date into v_date from public.shifts s where s.id = NEW.shift_id;
    if not public.attendance_window_open(v_date, NEW.start_time, NEW.end_time) then
      raise exception
        'Ngoài giờ điểm danh: chỉ từ 30 phút trước giờ bắt đầu đến giờ kết thúc của bạn. Quá giờ thì nhắn admin.'
        using errcode = '42501';
    end if;
  end if;

  NEW.confirmed_at := now();
  return NEW;
end;
$$;

drop trigger if exists shift_assignments_attendance on public.shift_assignments;
create trigger shift_assignments_attendance
  before insert or update or delete on public.shift_assignments
  for each row execute function public.enforce_attendance_rules();

-- ---------------------------------------------------------------------
-- 5. LUẬT TRÊN CA
-- ---------------------------------------------------------------------
-- Đổi ngày phải chặn cùng với xoá: nếu không, tạo ca hôm nay, điểm danh, rồi
-- dời ca về ngày đã lỡ là thành điểm danh trễ.

create or replace function public.enforce_shift_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_confirmed boolean;
begin
  if public.is_admin() then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  select exists (
    select 1 from public.shift_assignments a
    where a.shift_id = OLD.id and a.status = 'confirmed'
  ) into v_confirmed;

  if TG_OP = 'DELETE' then
    if v_confirmed then
      raise exception 'Ca đã có người điểm danh — chỉ admin xoá được.'
        using errcode = '42501';
    end if;
    if OLD.created_at < now() - interval '30 minutes' then
      raise exception 'Ca đã tạo quá 30 phút — chỉ admin xoá được.'
        using errcode = '42501';
    end if;
    return OLD;
  end if;

  if NEW.date <> OLD.date and v_confirmed then
    raise exception 'Ca đã có người điểm danh — chỉ admin đổi được ngày.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists shifts_attendance on public.shifts;
create trigger shifts_attendance
  before update or delete on public.shifts
  for each row execute function public.enforce_shift_rules();

-- ---------------------------------------------------------------------
-- 6. TỰ KIỂM TRA
-- ---------------------------------------------------------------------
-- Chạy cùng migration: sai biên giờ hoặc sai múi giờ là cả file báo lỗi.

do $$
begin
  -- Ca 08:00–12:00 ngày 05/01/2026, giờ Việt Nam.
  assert not public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 07:29+07');
  assert     public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 07:30+07');
  assert     public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 12:00+07');
  assert not public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 12:01+07');
  -- Bẫy UTC: 00:30 UTC chính là 07:30 giờ Việt Nam, còn 00:30 giờ Việt Nam thì chưa mở.
  assert     public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 00:30+00');
  assert not public.attendance_window_open('2026-01-05', '08:00', '12:00', '2026-01-05 00:30+07');
  -- Ca sáng sớm 00:15 mở cửa từ 23:45 hôm trước.
  assert     public.attendance_window_open('2026-01-05', '00:15', '06:00', '2026-01-04 23:45+07');
  assert not public.attendance_window_open('2026-01-05', '00:15', '06:00', '2026-01-04 23:44+07');
end;
$$;

-- ---------------------------------------------------------------------
-- 7. PHONG ADMIN (sửa email rồi chạy riêng)
-- ---------------------------------------------------------------------
--
--   update public.profiles set role = 'admin' where email = 'ban@congty.vn';
--
-- Xem ai đang là admin:
--
--   select email, display_name, role from public.profiles order by role, email;
