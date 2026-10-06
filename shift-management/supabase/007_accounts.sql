-- =====================================================================
-- Shift Scheduler — migration 007: trang Tài khoản (chỉ admin)
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 005_attendance.sql trước. Chạy lại nhiều lần vẫn an toàn.
--
-- 1. Cột profiles.displayed: false = không hiện người này trong các bảng
--    xếp ca (ví dụ tài khoản quản lý chỉ vào để xem tổng). Mặc định true.
-- 2. Admin sửa được tên hiển thị và displayed của mọi tài khoản.
-- 3. Người không phải admin không sửa được hai cột đó (kể cả của chính
--    mình) và không đổi được email — chặn ở trigger, gọi thẳng API cũng vậy.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. CỘT displayed
-- ---------------------------------------------------------------------

alter table public.profiles
  add column if not exists displayed boolean not null default true;

-- Tên hiển thị không được để trống. `not valid`: chỉ kiểm tra từ giờ trở đi,
-- không bắt dữ liệu cũ phải sạch mới chạy được migration.
alter table public.profiles
  drop constraint if exists profiles_display_name_not_blank;
alter table public.profiles
  add constraint profiles_display_name_not_blank
  check (length(btrim(display_name)) > 0) not valid;

-- ---------------------------------------------------------------------
-- 2. ADMIN SỬA ĐƯỢC MỌI TÀI KHOẢN
-- ---------------------------------------------------------------------
-- Policy "profiles: update own" (schema.sql) chỉ cho sửa dòng của mình. Thêm
-- một policy nữa cho admin; các policy update được OR với nhau.

drop policy if exists "profiles: admin can update" on public.profiles;
create policy "profiles: admin can update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. NGƯỜI KHÔNG PHẢI ADMIN KHÔNG SỬA ĐƯỢC TÀI KHOẢN
-- ---------------------------------------------------------------------
-- "update own" vẫn còn, nên phải chặn theo cột ở trigger. Vai trò đã có
-- trigger riêng từ 005 (protect_profile_role).

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

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();
