-- =====================================================================
-- Shift Scheduler — migration 014: tên tắt cho nơi trực
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 012_locations.sql trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Khối ca ngắn trên dòng thời gian (ví dụ 12:00–13:00) không đủ chỗ cho tên
-- đầy đủ "Fanpage" / "Discord", nên nhãn bị mất. Cột short_name cho admin
-- đặt tên tắt ("Page", "Dis") để giao diện dùng khi chật; null thì giao diện
-- tự lấy 3 chữ đầu của tên.
--
--   1. Cột locations.short_name (1–10 ký tự sau khi trim, hoặc null).
--   2. Ghi đè enforce_location_admin (012): trim short_name, rỗng thành null
--      — như name, để "Page " và "Page" không là hai giá trị khác nhau.
--   3. Đặt sẵn tên tắt Page / Dis cho hai nơi trực 013 đã tạo (chỉ khi chưa
--      có), không sinh dòng nhật ký.
-- Nhật ký không cần sửa: record_action_log so cả dòng dạng JSON, đổi tên tắt
-- tự được ghi thành "location.updated".
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.locations') is null
     or to_regprocedure('public.enforce_location_admin()') is null then
    raise exception 'Chạy 012_locations.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. CỘT
-- ---------------------------------------------------------------------

alter table public.locations add column if not exists short_name text;

alter table public.locations drop constraint if exists locations_short_name_valid;
alter table public.locations add constraint locations_short_name_valid
  check (
    short_name is null
    or (length(btrim(short_name)) between 1 and 10 and length(short_name) <= 10)
  );

-- ---------------------------------------------------------------------
-- 2. TRIGGER ADMIN (thay bản của 012)
-- ---------------------------------------------------------------------
-- Giữ nguyên bản 012, thêm dòng đánh dấu "-- 014".

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
  -- 014. Tên tắt toàn khoảng trắng coi như không đặt.
  NEW.short_name := nullif(btrim(NEW.short_name), '');
  return NEW;
end;
$$;

revoke execute on function public.enforce_location_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. TÊN TẮT CHO HAI NƠI TRỰC ĐANG CÓ
-- ---------------------------------------------------------------------
-- Tắt trigger ghi nhật ký trong lúc đặt: đây là dữ liệu khởi tạo của
-- migration, không phải thao tác của người dùng (như 013).

alter table public.locations disable trigger locations_action_log;

update public.locations
set short_name = 'Page'
where lower(name) = 'fanpage' and short_name is null;

update public.locations
set short_name = 'Dis'
where lower(name) = 'discord' and short_name is null;

alter table public.locations enable trigger locations_action_log;

commit;

-- Kiểm tra (tuỳ chọn):
--   select name, short_name from public.locations order by sort_order, name;
