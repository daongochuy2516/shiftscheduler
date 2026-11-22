-- =====================================================================
-- Shift Scheduler — migration 015: nhận ca phải có ít nhất một nơi trực
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy 012_locations.sql trước (013, 014 không bắt buộc). Chạy lại nhiều
-- lần vẫn an toàn.
--
-- Từ 012 nơi trực gắn vào từng lượt, nhưng nhận ca mẫu mà không chọn nơi
-- trực nào vẫn lưu được — lượt đó không cho biết người này trực ở đâu. File
-- này ghi đè enforce_attendance_rules (012), giữ nguyên mọi luật cũ và thêm:
--
--   R1. Nhận ca = người đã đăng nhập tự thêm CHÍNH MÌNH vào một ca sinh ra từ
--       ca mẫu (shifts.template_id khác null). Lượt đó phải có ít nhất một nơi
--       trực (đếm sau khi chuẩn hoá mảng). Áp cho mọi người có phiên đăng
--       nhập, kể cả admin. Không có phiên (SQL Editor, auth.uid() null) thì
--       không áp.
--   R2. Người không phải admin không được sửa lượt của mình trong ca sinh ra
--       từ ca mẫu sao cho mảng nơi trực thành rỗng (chỉ xét khi mảng đổi).
--       Admin được phép — để sửa dữ liệu qua form ca.
--
-- Hệ quả: chưa có nơi trực nào đang hiện thì không ai nhận ca được — admin
-- cần thêm nơi trực trong "Quản lý nơi trực" trước.
-- Lượt cũ đã rỗng từ trước vẫn sửa giờ / ghi chú / điểm danh bình thường: R2
-- chỉ chặn khi chính lần lưu này làm mảng đổi thành rỗng.
-- Câu báo lỗi trùng từng chữ với supabaseBackend.ts và mockBackend.ts.
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.locations') is null
     or to_regprocedure('public.normalize_location_ids(uuid[])') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'shift_assignments'
         and column_name = 'location_ids'
     ) then
    raise exception 'Chạy 012_locations.sql trước migration này.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. LUẬT TRÊN PHÂN CÔNG (thay bản của 012)
-- ---------------------------------------------------------------------
-- Giữ nguyên toàn bộ bản 012, thêm phần đánh dấu "-- 015".

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
  -- 015. Ca cha sinh ra từ ca mẫu nào (null = ca tạo tay).
  v_template uuid;
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
  -- 015. Đọc luôn template_id trong cùng lệnh khoá.
  select s.date, s.template_id into v_date, v_template
  from public.shifts s
  where s.id = NEW.shift_id
  for no key update;

  -- 015. R1: nhận ca (tự thêm mình vào ca sinh ra từ ca mẫu) phải có ít nhất
  -- một nơi trực. Áp cả admin; không có phiên (SQL Editor) thì bỏ qua.
  if TG_OP = 'INSERT'
     and v_me is not null
     and NEW.user_id = v_me
     and v_template is not null
     and cardinality(NEW.location_ids) = 0 then
    raise exception 'Nhận ca phải chọn ít nhất một nơi trực.'
      using errcode = '23514';
  end if;

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

      -- 015. R2: lượt của ca mẫu không được bỏ hết nơi trực. Chỉ xét khi
      -- mảng đổi, để lượt cũ đã rỗng từ trước vẫn sửa giờ / điểm danh được.
      if v_template is not null
         and NEW.location_ids is distinct from OLD.location_ids
         and cardinality(NEW.location_ids) = 0 then
        raise exception 'Lượt của ca mẫu phải giữ ít nhất một nơi trực.'
          using errcode = '23514';
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
-- 2. QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------
-- Như 010 / 012: hàm trigger không cần ai gọi được qua /rest/v1/rpc.

revoke execute on function public.enforce_attendance_rules() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. TỰ KIỂM TRA
-- ---------------------------------------------------------------------

do $$
begin
  assert exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'enforce_attendance_rules'
      and position('Nhận ca phải chọn ít nhất một nơi trực.' in p.prosrc) > 0
      and position('Lượt của ca mẫu phải giữ ít nhất một nơi trực.' in p.prosrc) > 0
  ), 'enforce_attendance_rules chưa phải bản 015';

  assert exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.shift_assignments'::regclass
      and t.tgname = 'shift_assignments_attendance'
      and not t.tgisinternal
  ), 'Thiếu trigger shift_assignments_attendance';
end;
$$;

commit;

-- Kiểm tra (tuỳ chọn): lượt nhận ca cũ chưa có nơi trực (R2 không bắt sửa,
-- chỉ để biết còn bao nhiêu):
--   select count(*)
--   from public.shift_assignments a
--   join public.shifts s on s.id = a.shift_id
--   where s.template_id is not null and cardinality(a.location_ids) = 0;
