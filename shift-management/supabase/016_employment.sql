-- =====================================================================
-- Shift Scheduler — migration 016: ngày vào làm / ngày nghỉ việc
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 011_accounts_private.sql trước. Chạy lại nhiều lần vẫn an toàn.
--
--   1. profiles.joined_on: ngày vào công ty. Tài khoản đã có lấy theo ngày tạo
--      tài khoản (giờ Việt Nam) — admin sửa lại cho đúng ở trang Tài khoản.
--      Tài khoản mới mặc định là hôm nay.
--   2. profiles.left_on: ngày nghỉ việc, null = đang làm. Từ ngày đó trở đi
--      (giờ Việt Nam) người này là "đã nghỉ": vẫn đăng nhập được, xem được hồ
--      sơ của mình qua my_profile(), nhưng không đọc / ghi được gì khác —
--      chặn bằng policy RESTRICTIVE trên mọi bảng, gọi thẳng API cũng vậy.
--      Đặt ngày ở tương lai = báo trước, tới ngày mới khoá.
--   3. Ngày vào: chỉ admin sửa. Ngày nghỉ: chỉ đặt trong SQL Editor (không
--      có phiên đăng nhập) — trên web ai cũng chỉ xem, kể cả admin. id và
--      created_at không ai đổi qua API. Trigger riêng ở mục 4; câu lệnh mẫu
--      ở mục 5.
--   4. Có ngày nghỉ thì phải là staff (check profiles_left_is_staff): đặt
--      ngày nghỉ luôn kèm hạ vai trò. is_admin() cũng viết lại để coi người
--      đã nghỉ không phải admin — lớp dự phòng.
--   5. Realtime: các bảng về REPLICA IDENTITY DEFAULT để sự kiện xoá (không
--      qua RLS) không mang nội dung dòng cũ tới người đã nghỉ (mục 3).
--
-- Hai cột KHÔNG nằm trong danh bạ (quyền theo cột của 011): nhân viên không
-- đọc được của người khác. Của mình đi qua my_profile(), của mọi người qua
-- list_accounts() (chỉ admin) — hai hàm trả `profiles.*` nên tự có cột mới.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.my_profile()') is null
     or to_regprocedure('public.list_accounts()') is null then
    raise exception 'Chạy 011_accounts_private.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. HAI CỘT MỚI
-- ---------------------------------------------------------------------
-- Điền ngày vào làm cho tài khoản cũ chỉ ở lần chạy đầu (lúc vừa thêm cột):
-- chạy lại file thì không ghi đè ngày admin đã sửa / đã xoá.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'joined_on'
  ) then
    alter table public.profiles add column joined_on date;
    -- Cột vừa thêm nên mọi dòng đều null; `where` chỉ để nói rõ ý.
    update public.profiles
      set joined_on = (created_at at time zone 'Asia/Ho_Chi_Minh')::date
      where joined_on is null;
  end if;
end;
$$;

-- Đặt sau lần điền ở trên: default có now() mà thêm cùng lúc với cột thì
-- mọi dòng cũ nhận ngày hôm nay chứ không phải ngày tạo tài khoản.
alter table public.profiles
  alter column joined_on set default ((now() at time zone 'Asia/Ho_Chi_Minh')::date);

alter table public.profiles
  add column if not exists left_on date;

alter table public.profiles
  drop constraint if exists profiles_left_after_joined;
alter table public.profiles
  add constraint profiles_left_after_joined
  check (left_on is null or joined_on is null or left_on >= joined_on);

-- Người đã nghỉ (hoặc đã có ngày nghỉ đặt trước) luôn là staff. Không để tồn
-- tại tài khoản vừa admin vừa có ngày nghỉ: bỏ ngày nghỉ là có lại quyền admin
-- ngay. Đặt ngày nghỉ thì hạ vai trò trong cùng câu lệnh (ví dụ ở mục 5);
-- quên là database từ chối. Dữ liệu cũ vi phạm thì dừng hẳn và chỉ cách sửa,
-- không thêm ràng buộc `not valid` cho qua.
do $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.profiles
  where left_on is not null and role is distinct from 'staff';
  if v_count > 0 then
    raise exception 'Có % tài khoản đã đặt ngày nghỉ nhưng không phải staff. Hạ vai trò trước rồi chạy lại file: update public.profiles set role = ''staff'' where left_on is not null;', v_count;
  end if;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_left_is_staff;
alter table public.profiles
  add constraint profiles_left_is_staff
  check (left_on is null or role = 'staff');

-- ---------------------------------------------------------------------
-- 2. AI CÒN ĐANG LÀM
-- ---------------------------------------------------------------------
-- true cho người đăng nhập chưa tới ngày nghỉ, và cho thao tác không có
-- người đăng nhập (SQL Editor, service_role) — giống is_admin().

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is null
      or exists (
           select 1 from public.profiles p
           where p.id = auth.uid()
             and (p.left_on is null
                  or p.left_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date)
         );
$$;

-- Policy gọi hàm này dưới quyền người gọi nên authenticated phải gọi được.
revoke execute on function public.is_active_member() from public, anon;
grant  execute on function public.is_active_member() to authenticated;

-- Bản mới nhất là 005. Thêm điều kiện còn đang làm: mọi trigger và policy
-- dùng is_admin() (ca mẫu, nơi trực, luật chấm công, sửa tài khoản,
-- list_accounts) tự coi admin đã nghỉ như người thường.
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
           where p.id = auth.uid()
             and p.role = 'admin'
             and (p.left_on is null
                  or p.left_on > (now() at time zone 'Asia/Ho_Chi_Minh')::date)
         );
$$;

revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 3. NGƯỜI ĐÃ NGHỈ KHÔNG ĐỌC / GHI GÌ
-- ---------------------------------------------------------------------
-- Policy RESTRICTIVE được AND với các policy sẵn có, nên không phải viết lại
-- từng policy cũ. Đọc thì trả về 0 dòng, ghi thì bị từ chối. `(select …)`
-- để Postgres tính hàm một lần mỗi truy vấn chứ không mỗi dòng.
-- my_profile() là security definer nên vẫn đọc được hồ sơ của chính mình.
-- Bảng của migration chưa chạy (002, 012) thì bỏ qua.

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'shifts', 'shift_assignments', 'shift_templates',
    'locations', 'action_logs'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'drop policy if exists "%1$s: active members only" on public.%1$I', t);
    execute format(
      'create policy "%1$s: active members only" on public.%1$I
         as restrictive for all to authenticated
         using ((select public.is_active_member()))
         with check ((select public.is_active_member()))', t);
  end loop;
end;
$$;

-- Trigger chạy TRƯỚC RLS WITH CHECK. Không có lớp này thì người đã nghỉ
-- INSERT thử một lượt phân công với shift_id / location_id đoán được, và câu
-- báo lỗi của trigger nghiệp vụ (ca không tồn tại, nơi trực đã ẩn…) cho biết
-- id đó có thật hay không — dò được dữ liệu mà không đọc được. Trigger này
-- đứng trước mọi trigger khác của bảng (Postgres chạy theo thứ tự tên; mọi
-- trigger sẵn có bắt đầu bằng tên bảng, "active_…" đứng trước) và trả đúng
-- câu của RLS, không phụ thuộc nội dung dòng. UPDATE / DELETE thì RLS đã lọc
-- dòng trước khi trigger chạy; gắn cả vào cho chắc.
create or replace function public.reject_former_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception 'new row violates row-level security policy for table "%"', TG_TABLE_NAME
      using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

revoke execute on function public.reject_former_members() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'shifts', 'shift_assignments', 'shift_templates',
    'locations', 'action_logs'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists active_members_guard on public.%I', t);
    execute format(
      'create trigger active_members_guard
         before insert or update or delete on public.%I
         for each row execute function public.reject_former_members()', t);
  end loop;
end;
$$;

-- Realtime không áp RLS cho sự kiện DELETE (không còn dòng để xét quyền), nên
-- người đã nghỉ đang nghe vẫn nhận sự kiện xoá. Với REPLICA IDENTITY FULL
-- (schema.sql, 002, 012 đặt) sự kiện mang cả dòng cũ, và bộ lọc của người
-- nghe được so trên cả dòng đó: dò được tiêu đề, ngày, ai trong ca, ghi chú
-- của những gì bị xoá. DEFAULT thì dòng cũ chỉ còn khoá chính — còn lộ id
-- của dòng vừa xoá (giới hạn của Realtime, không chặn được ở database), hết
-- lộ nội dung. App không đọc nội dung sự kiện, chỉ tải lại
-- (supabaseBackend.subscribe), nên không mất gì. Đừng đặt lại FULL.
do $$
declare
  t text;
begin
  foreach t in array array['shifts', 'shift_assignments', 'shift_templates', 'locations'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity default', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. KHOÁ CỘT CỦA HỒ SƠ
-- ---------------------------------------------------------------------
-- Luật của 016 nằm trong trigger RIÊNG (profiles_protect_employment), không
-- viết đè protect_profile_fields() của 007: chạy lại 007 (hay 005, 010) sau
-- này chỉ ghi lại hàm của chính nó, không xoá được luật ở đây.
--
-- protect_profile_fields() trả về đúng bản của 007 — bản 016 trước có viết
-- đè nó, chạy lại file này là gỡ phần đó ra.

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return NEW;
  end if;
  if NEW.display_name is distinct from OLD.display_name
     or NEW.displayed is distinct from OLD.displayed
     or NEW.email     is distinct from OLD.email then
    raise exception 'Bạn không có quyền sửa tài khoản.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

revoke execute on function public.protect_profile_fields() from public, anon, authenticated;

-- Mọi thay đổi có phiên đăng nhập (web, API — kể cả admin):
--   - id, created_at: không ai đổi. Đổi id là tráo danh tính (gắn hồ sơ đang
--     làm vào tài khoản đã nghỉ) để lách ngày nghỉ.
--   - left_on: không ai đổi; chỉ SQL Editor (không phiên) đặt được.
--   - joined_on: chỉ admin.
create or replace function public.protect_employment_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if NEW.id is distinct from OLD.id
     or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Không đổi được mã hay ngày tạo của tài khoản.'
      using errcode = '42501';
  end if;
  if NEW.left_on is distinct from OLD.left_on then
    raise exception 'Ngày nghỉ việc chỉ quản trị database mới đổi được.'
      using errcode = '42501';
  end if;
  if NEW.joined_on is distinct from OLD.joined_on and not public.is_admin() then
    raise exception 'Bạn không có quyền sửa tài khoản.'
      using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_employment on public.profiles;
create trigger profiles_protect_employment
  before update on public.profiles
  for each row execute function public.protect_employment_fields();

revoke execute on function public.protect_employment_fields() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. KIỂM TRA (tuỳ chọn)
-- ---------------------------------------------------------------------
-- Đặt / bỏ ngày nghỉ (chỉ làm trong SQL Editor, web không đặt được).
-- Đặt ngày nghỉ luôn kèm hạ vai trò về staff trong cùng câu — thiếu là
-- check profiles_left_is_staff từ chối.
--   update public.profiles set left_on = '2026-12-01', role = 'staff' where email = '...';
--   update public.profiles set left_on = null where email = '...';
-- Rồi đăng nhập bằng người đó, gọi qua API:
--   GET  /rest/v1/shifts?select=id     -> []  (0 dòng)
--   POST /rest/v1/rpc/my_profile       -> hồ sơ của mình, có left_on
--   POST /rest/v1/shifts {...}         -> 403 new row violates row-level security
