-- =====================================================================
-- Shift Scheduler — migration 008: ca mẫu chỉ admin quản lý
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 002_shift_templates.sql và 005_attendance.sql trước. Chạy lại
-- nhiều lần vẫn an toàn.
--
-- LUẬT CHO NHÂN VIÊN (role = 'staff'): không tạo, sửa, bật / tắt hay xoá
-- được ca mẫu. Vẫn NHẬN ca mẫu bình thường — nhận ca chỉ đọc shift_templates
-- rồi ghi vào shifts / shift_assignments, không đụng tới bảng này.
--
-- Chặn bằng trigger chứ không bằng RLS: RLS từ chối một UPDATE / DELETE thì
-- Supabase không báo lỗi, chỉ lặng lẽ sửa 0 dòng — người dùng sẽ tưởng đã lưu.
-- =====================================================================

do $$
begin
  if to_regclass('public.shift_templates') is null then
    raise exception 'Chạy 002_shift_templates.sql trước migration này.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Chạy 005_attendance.sql trước migration này.';
  end if;
end;
$$;

create or replace function public.enforce_template_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Bạn không có quyền sửa ca mẫu.'
      using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists shift_templates_admin_only on public.shift_templates;
create trigger shift_templates_admin_only
  before insert or update or delete on public.shift_templates
  for each row execute function public.enforce_template_admin();
