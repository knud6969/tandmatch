-- Del 12: tilbagetrækning af samtykke og oprydning, aktivitetsstempel og rate limits (architecture 5.3, 7.7, 10.3).

-- withdraw_consent(): sætter withdrawn_at; image_upload sletter patientens billedrækker på alle sager (også sendte),
-- så klinikkerne mister dem; ai_processing lukker aktive samtaler. Returnerer filstierne, så serveren kan rydde storage.
-- Idempotent genforsøg, indtil confirm_consent_cleanup() er kaldt.
create function public.withdraw_consent(p_consent_id uuid)
returns table (withdrawn_at timestamptz, consent_type public.consent_type, deleted_image_paths text[], closed_conversations integer, withdrawn_leads integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_consent public.consents%rowtype;
  v_at timestamptz := now();
  v_paths text[] := '{}';
  v_closed integer := 0;
  v_pending boolean;
  v_leads integer := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_consent from public.consents where id = p_consent_id and patient_id = v_uid for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_consent.withdrawn_at is not null then
    if v_consent.cleanup_done then
      raise exception 'ALREADY_WITHDRAWN' using errcode = 'P0001';
    end if;
    if v_consent.type = 'ai_processing' then
      with c as (
        update public.ai_conversations set status = 'closed' where patient_id = v_uid and status = 'active' returning 1
      ) select count(*) into v_closed from c;
    end if;
    return query
      select v_consent.withdrawn_at, v_consent.type, coalesce(v_consent.pending_storage_paths, '{}'), v_closed, 0;
    return;
  end if;

  update public.consents set withdrawn_at = v_at where id = p_consent_id;

  if v_consent.type = 'image_upload' then
    with d as (
      delete from public.case_images where patient_id = v_uid returning storage_path
    ) select coalesce(array_agg(d.storage_path), '{}') into v_paths from d;
  elsif v_consent.type = 'ai_processing' then
    with c as (
      update public.ai_conversations set status = 'closed' where patient_id = v_uid and status = 'active' returning 1
    ) select count(*) into v_closed from c;
  elsif v_consent.type = 'health_data_sharing' then
    -- Ubesvarede og accepterede leads uden booking trækkes tilbage, reservationer frigives. Bookede bookinger består.
    -- Kun hvis patienten ikke har et andet aktivt delingssamtykke (L3).
    if not exists (
      select 1 from public.consents c
       where c.patient_id = v_uid and c.type = 'health_data_sharing' and c.withdrawn_at is null
    ) then
      v_leads := public.withdraw_open_leads(v_uid, null);
    end if;
  end if;

  v_pending := (v_consent.type = 'image_upload' and coalesce(array_length(v_paths, 1), 0) > 0)
            or (v_consent.type = 'ai_processing' and not public.is_permanent_user());

  update public.consents
     set pending_storage_paths = case when v_consent.type = 'image_upload' then v_paths else null end,
         cleanup_done = not v_pending
   where id = p_consent_id;

  return query select v_at, v_consent.type, v_paths, v_closed, v_leads;
end;
$$;

create function public.confirm_consent_cleanup(p_consent_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  update public.consents set cleanup_done = true, pending_storage_paths = null
   where id = p_consent_id and patient_id = v_uid;
end;
$$;

-- touch_last_active(): opdaterer last_active_at for den indloggede anonyme bruger (48 timers udløb, 7.7).
create function public.touch_last_active()
returns void
language sql security definer set search_path = ''
as $$
  update public.profiles set last_active_at = now() where id = (select auth.uid()) and is_anonymous = true;
$$;

-- Rate limit pr. nøgle (IP-hash + scope) pr. time. Kun service role. Ingen auth.uid().
create table public.rate_limits (
  key text primary key check (char_length(key) between 1 and 200),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from authenticated;

create function public.consume_rate_limit(p_key text, p_limit integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_window text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24');
  v_key text := p_key || ':' || v_window;
  v_ok boolean;
begin
  if p_limit < 1 or char_length(p_key) > 150 then
    return false;
  end if;
  delete from public.rate_limits
   where key < p_key || ':' || to_char((now() - interval '2 hours') at time zone 'utc', 'YYYYMMDDHH24')
     and key like p_key || ':%';
  insert into public.rate_limits as r (key, hits) values (v_key, 1)
  on conflict (key) do update set hits = r.hits + 1 where r.hits < p_limit
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.withdraw_consent(uuid) from public, anon;
revoke all on function public.confirm_consent_cleanup(uuid) from public, anon;
revoke all on function public.touch_last_active() from public, anon;
revoke all on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.withdraw_consent(uuid) to authenticated;
grant execute on function public.confirm_consent_cleanup(uuid) to authenticated;
grant execute on function public.touch_last_active() to authenticated;
grant execute on function public.consume_rate_limit(text, integer) to service_role;

-- Ingen TRUNCATE, REFERENCES eller TRIGGER for anon/authenticated på nogen tabel i public (M6).
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
