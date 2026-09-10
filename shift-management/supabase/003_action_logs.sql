-- =====================================================================
-- Shift Scheduler — migration 003: nhật ký thao tác (append-only)
-- Chạy trong: Supabase Dashboard -> SQL Editor -> New query
-- Cần chạy schema.sql (001) và 002_shift_templates.sql trước.
-- An toàn khi chạy lại nhiều lần.
--
-- MÔ HÌNH BẢO MẬT
--   - Nhân viên đăng nhập: CHỈ được SELECT.
--   - Không có quyền INSERT / UPDATE / DELETE ở cả hai tầng:
--       * tầng GRANT (revoke all, chỉ grant select)
--       * tầng RLS   (chỉ có policy cho SELECT, không có policy nào khác)
--     Hai tầng độc lập, nên gọi thẳng Supabase API cũng không lách được.
--   - Log do TRIGGER sinh ra. Hàm trigger là SECURITY DEFINER nên chạy dưới
--     quyền chủ sở hữu bảng, ghi được dù người gọi không có quyền INSERT.
--   - Chỉ service_role / quản trị database mới can thiệp được vào log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. BẢNG
-- ---------------------------------------------------------------------

create table if not exists public.action_logs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- Ai làm. actor_id có thể null nếu thao tác chạy từ SQL editor hoặc
  -- service_role. Email/tên được chụp lại tại thời điểm ghi log để log vẫn
  -- đọc được sau khi tài khoản bị xoá.
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_email text,
  actor_name  text,

  -- Làm gì: 'shift.created', 'assignment.claimed', 'template.toggled', ...
  action      text not null,

  -- Tác động lên cái gì: 'shift' | 'assignment' | 'template'
  entity_type text not null,
  entity_id   uuid,

  -- Câu mô tả đọc được ngay, không cần suy luận từ JSON.
  summary     text,

  -- Dữ liệu trước/sau để đối chiếu chính xác.
  old_data    jsonb,
  new_data    jsonb,

  -- Ngữ cảnh thêm: tên ca, ngày, người bị phân công, tự nhận hay không...
  metadata    jsonb not null default '{}'::jsonb
);

create index if not exists action_logs_created_at_idx
  on public.action_logs (created_at desc);
create index if not exists action_logs_actor_idx
  on public.action_logs (actor_id);
create index if not exists action_logs_action_idx
  on public.action_logs (action);
create index if not exists action_logs_entity_idx
  on public.action_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- 2. HÀM GHI LOG
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: chạy dưới quyền chủ sở hữu (postgres), nên ghi được vào
-- action_logs dù vai trò authenticated đã bị revoke quyền INSERT.
-- search_path = '' để tránh bị chiếm quyền qua schema giả; mọi tên đều ghi
-- đầy đủ schema.
--
-- Đây là AFTER trigger nên giá trị trả về bị bỏ qua; luôn trả null.

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
              'note',          a.note
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
      -- Ca sinh ra từ việc nhận ca mẫu KHÔNG có dòng log riêng.
      --
      -- Nhận ca là một hành động của người dùng, nhưng dưới database nó là
      -- hai lệnh insert: tạo ca rồi thêm phân công. Tách thành hai dòng log
      -- khiến một cú bấm trông như hai sự kiện rời rạc. Dòng "Nhận ca" ngay
      -- sau đây ghi lại cả việc ca này được tạo mới, kèm dữ liệu đầy đủ.
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

    v_meta := jsonb_build_object(
      'shift_id',       v_shift_id,
      'shift_title',    v_shift_title,
      'shift_date',     v_shift_date,
      'target_user_id', coalesce(NEW.user_id, OLD.user_id),
      'target_name',    v_target_name,
      'self',           coalesce(NEW.user_id, OLD.user_id) = v_actor
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
                       NEW.start_time, NEW.end_time);
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
                       NEW.start_time, NEW.end_time);
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
      -- là việc cần audit rõ.
      if OLD.status is distinct from NEW.status
         and OLD.start_time = NEW.start_time
         and OLD.end_time   = NEW.end_time
         and OLD.user_id    = NEW.user_id
         and OLD.note is not distinct from NEW.note then
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
         and OLD.note is not distinct from NEW.note then
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

-- ---------------------------------------------------------------------
-- 3. GẮN TRIGGER
-- ---------------------------------------------------------------------
-- AFTER: chỉ ghi log khi thao tác đã thành công thật (qua được mọi ràng
-- buộc và RLS của bảng gốc).
--
-- Ngoại lệ là xoá ca, phải dùng BEFORE: chỉ lúc đó danh sách nhân viên trong
-- ca mới còn tồn tại để chụp lại. Ở AFTER thì `on delete cascade` đã xoá sạch.
-- Vẫn an toàn vì log nằm chung một transaction — thao tác xoá mà thất bại thì
-- dòng log cũng bị rollback theo.

drop trigger if exists shifts_action_log on public.shifts;
create trigger shifts_action_log
  after insert or update on public.shifts
  for each row execute function public.record_action_log();

drop trigger if exists shifts_action_log_delete on public.shifts;
create trigger shifts_action_log_delete
  before delete on public.shifts
  for each row execute function public.record_action_log();

drop trigger if exists shift_assignments_action_log on public.shift_assignments;
create trigger shift_assignments_action_log
  after insert or update or delete on public.shift_assignments
  for each row execute function public.record_action_log();

drop trigger if exists shift_templates_action_log on public.shift_templates;
create trigger shift_templates_action_log
  after insert or update or delete on public.shift_templates
  for each row execute function public.record_action_log();

-- ---------------------------------------------------------------------
-- 4. QUYỀN — CHỈ ĐƯỢC ĐỌC
-- ---------------------------------------------------------------------

alter table public.action_logs enable row level security;

-- Tầng 1: quyền SQL. Không có INSERT/UPDATE/DELETE thì API cũng không gọi được.
revoke all on public.action_logs from anon;
revoke all on public.action_logs from authenticated;
grant select on public.action_logs to authenticated;

-- Tầng 2: RLS. Chỉ có policy cho SELECT — cố tình không tạo policy nào khác,
-- nên mọi INSERT/UPDATE/DELETE đều bị từ chối.
drop policy if exists "action_logs: authenticated can read" on public.action_logs;
create policy "action_logs: authenticated can read"
  on public.action_logs for select
  to authenticated
  using (true);

-- KHÔNG tạo policy insert/update/delete. Đây là chủ ý, đừng thêm vào.

-- ---------------------------------------------------------------------
-- 5. KIỂM CHỨNG (tuỳ chọn)
-- ---------------------------------------------------------------------
-- Chạy khi đang đăng nhập bằng tài khoản nhân viên để tự kiểm tra:
--
--   select count(*) from public.action_logs;              -- chạy được
--   insert into public.action_logs (action, entity_type)  -- phải LỖI
--     values ('fake.action', 'shift');
--   update public.action_logs set summary = 'sửa trộm';   -- phải LỖI
--   delete from public.action_logs;                       -- phải LỖI
--
-- Ba lệnh sau phải báo permission denied. Nếu lệnh nào chạy được thì
-- phần revoke ở mục 4 chưa được áp dụng.
