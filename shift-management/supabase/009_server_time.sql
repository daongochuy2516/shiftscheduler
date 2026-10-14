-- =====================================================================
-- Shift Scheduler — migration 009: giờ máy chủ cho đồng hồ trên header
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Không cần migration nào khác trước. Chạy lại nhiều lần vẫn an toàn.
--
-- Luật điểm danh so với giờ của database, nên đồng hồ trên web chạy theo
-- đúng đồng hồ đó chứ không theo giờ máy người dùng. Chưa chạy file này thì
-- đồng hồ dùng giờ máy, không vỡ gì.
-- =====================================================================

-- clock_timestamp() chứ không now(): now() là lúc transaction bắt đầu.
create or replace function public.server_now()
returns timestamptz
language sql
volatile
set search_path = ''
as $$
  select clock_timestamp();
$$;

-- Như mọi thứ khác: anon không có gì, chỉ người đã đăng nhập gọi được.
revoke execute on function public.server_now() from public, anon;
grant execute on function public.server_now() to authenticated;
