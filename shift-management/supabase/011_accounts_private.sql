-- =====================================================================
-- Shift Scheduler — migration 011: dữ liệu tài khoản chỉ admin đọc được
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 003, 005 và 007 trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Trước đây policy "profiles: authenticated can read" cho mọi nhân viên đọc
-- cả bảng profiles: email, vai trò của mọi người. Trang Tài khoản chỉ ẩn
-- trên giao diện, gọi thẳng API là đọc được hết. Từ file này:
--
--   1. Nhân viên chỉ đọc được phần DANH BẠ của profiles: id, tên hiển thị,
--      hiện / ẩn, ngày tạo — đủ để hiện tên trên lịch. Email và vai trò bị
--      thu bằng quyền theo cột, nên `select *` hay `select email` qua API
--      đều bị từ chối, của ai cũng vậy.
--   2. list_accounts(): máy chủ kiểm tra người gọi là admin rồi mới trả danh
--      sách tài khoản đầy đủ; không phải admin thì từ chối (42501). Trang Tài
--      khoản đọc ở đây.
--   3. my_profile(): hồ sơ đầy đủ của chính mình (email, vai trò) — lúc đăng
--      nhập ứng dụng cần vai trò để biết khoá gì.
--   4. action_logs.actor_email cũng là email: thu luôn cột này. Nhật ký vẫn
--      có actor_id và actor_name.
--
-- Quyền sửa không đổi: "profiles: update own" + trigger 007, và policy admin.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'displayed'
  ) then
    raise exception 'Chạy 007_accounts.sql trước migration này.';
  end if;
  if to_regclass('public.action_logs') is null then
    raise exception 'Chạy 003_action_logs.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. DANH BẠ: CHỈ CÁC CỘT ĐỂ HIỆN TÊN
-- ---------------------------------------------------------------------
-- Quyền theo cột không gỡ được khi còn quyền cả bảng, nên thu cả bảng rồi
-- cấp lại từng cột. Policy SELECT (using true) giữ nguyên: mọi dòng, nhưng
-- chỉ những cột này. Cột mới thêm vào profiles sau này mặc định KHÔNG đọc
-- được — muốn cho đọc thì grant thêm ở đây.

revoke select on public.profiles from authenticated;
grant select (id, display_name, displayed, created_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. HỒ SƠ CỦA CHÍNH MÌNH
-- ---------------------------------------------------------------------

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke execute on function public.my_profile() from public, anon;
grant  execute on function public.my_profile() to authenticated;

-- ---------------------------------------------------------------------
-- 3. DANH SÁCH TÀI KHOẢN — CHỈ ADMIN
-- ---------------------------------------------------------------------
-- is_admin() coi "không có người đăng nhập" là admin (để SQL Editor được miễn
-- luật). Ở đây phải có người đăng nhập thật.

create or replace function public.list_accounts()
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Bạn không có quyền truy cập trang này.'
      using errcode = '42501';
  end if;
  return query
    select * from public.profiles order by display_name;
end;
$$;

revoke execute on function public.list_accounts() from public, anon;
grant  execute on function public.list_accounts() to authenticated;

-- ---------------------------------------------------------------------
-- 4. EMAIL TRONG NHẬT KÝ
-- ---------------------------------------------------------------------

revoke select on public.action_logs from authenticated;
grant select (
  id, created_at, actor_id, actor_name, action, entity_type, entity_id,
  summary, old_data, new_data, metadata
) on public.action_logs to authenticated;

-- ---------------------------------------------------------------------
-- 5. KIỂM TRA (tuỳ chọn) — chạy bằng tài khoản nhân viên qua API:
-- ---------------------------------------------------------------------
--   GET  /rest/v1/profiles?select=email          -> 401/403 permission denied
--   GET  /rest/v1/profiles?select=id,display_name -> chạy được
--   POST /rest/v1/rpc/list_accounts              -> 403 "Bạn không có quyền truy cập trang này."
