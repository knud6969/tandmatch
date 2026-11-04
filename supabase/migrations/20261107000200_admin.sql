-- Admin (features/admin/README.md 4.3 og 5.3; PR C, 2026-11-04).
--  * admin_actions: log over admins handlinger. Kun admin kan læse; rækker skrives kun af funktionerne herunder.
--  * admin_change_clinic_status(): "Verificér" (registered -> verified) og "Sæt på pause" (verified -> registered).
--  * admin_moderate(): godkend eller afvis en anmeldelse eller et svar fra en klinik.
-- Begge funktioner er security definer med fast search_path, tjekker selv is_admin() og is_permanent_user(), og er kun
-- tilgængelige for authenticated. Admin får ingen adgang til sager, leads, bookinger, beskeder, outbox eller push-tokens.

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid null references public.profiles (id) on delete set null,
  action text not null check (action in ('clinic_status', 'moderate_review', 'moderate_reply')),
  target_id uuid not null,
  from_value text not null,
  to_value text not null,
  reason text null check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create index admin_actions_created_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;

create policy admin_actions_select_admin on public.admin_actions
  for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.admin_actions from authenticated, anon;

-- Fælles adgangstjek: kun en permanent admin.
create function public.assert_admin()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() or not public.is_permanent_user() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_admin() from public, anon, authenticated;

-- Begrundelse: tom tekst er ingen begrundelse; over 500 tegn afvises.
create function public.admin_clean_reason(p_reason text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  return v_reason;
end;
$$;

revoke all on function public.admin_clean_reason(text) from public, anon, authenticated;

create function public.admin_change_clinic_status(
  p_clinic_id uuid, p_status public.clinic_status, p_reason text default null
)
returns public.clinic_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text;
  v_from public.clinic_status;
begin
  perform public.assert_admin();
  v_reason := public.admin_clean_reason(p_reason);
  select k.status into v_from from public.clinics k where k.id = p_clinic_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not ((v_from = 'registered' and p_status = 'verified') or (v_from = 'verified' and p_status = 'registered')) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  perform public.admin_set_clinic_status(p_clinic_id, p_status);
  insert into public.admin_actions (admin_id, action, target_id, from_value, to_value, reason)
  values ((select auth.uid()), 'clinic_status', p_clinic_id, v_from::text, p_status::text, v_reason);
  return p_status;
end;
$$;

create function public.admin_moderate(
  p_kind text, p_id uuid, p_status public.moderation_status, p_reason text default null
)
returns public.moderation_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text;
  v_from public.moderation_status;
begin
  perform public.assert_admin();
  if p_kind not in ('review', 'reply') or p_status = 'pending' then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  v_reason := public.admin_clean_reason(p_reason);
  if p_status = 'rejected' and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  if p_kind = 'review' then
    select r.moderation_status into v_from from public.reviews r where r.id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.reviews
       set moderation_status = p_status, moderated_by = (select auth.uid()), moderated_at = now(),
           rejection_reason = case when p_status = 'rejected' then v_reason end
     where id = p_id;
  else
    select r.moderation_status into v_from from public.review_replies r where r.id = p_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.review_replies
       set moderation_status = p_status, moderated_by = (select auth.uid()), moderated_at = now(),
           rejection_reason = case when p_status = 'rejected' then v_reason end
     where id = p_id;
  end if;

  insert into public.admin_actions (admin_id, action, target_id, from_value, to_value, reason)
  values ((select auth.uid()), 'moderate_' || p_kind, p_id, v_from::text, p_status::text, v_reason);
  return p_status;
end;
$$;

revoke all on function public.admin_change_clinic_status(uuid, public.clinic_status, text) from public, anon;
revoke all on function public.admin_moderate(text, uuid, public.moderation_status, text) from public, anon;
grant execute on function public.admin_change_clinic_status(uuid, public.clinic_status, text) to authenticated;
grant execute on function public.admin_moderate(text, uuid, public.moderation_status, text) to authenticated;
