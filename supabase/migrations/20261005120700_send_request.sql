-- Trin 2: afsendelse og simpel matching (architecture 5.3, 6.6) samt anonyme AI-lofter (7.6).

create table public.ai_usage_daily (
  day date primary key,
  anonymous_calls integer not null default 0 check (anonymous_calls >= 0)
);

alter table public.ai_usage_daily enable row level security;
-- Ingen policies: tabellen rører kun public.try_consume_anonymous_ai_call().

-- Tæller AI-kald fra anonyme sessioner pr. døgn. Returnerer false ved loftet eller for ikke-anonyme.
create or replace function public.try_consume_anonymous_ai_call(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if p_cap < 1 then
    return false;
  end if;
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_anonymous) then
    return false;
  end if;

  insert into public.ai_usage_daily as u (day, anonymous_calls)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set anonymous_calls = u.anonymous_calls + 1
    where u.anonymous_calls < p_cap
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.try_consume_anonymous_ai_call(integer) from public, anon;
grant execute on function public.try_consume_anonymous_ai_call(integer) to authenticated;

-- send_request: kun permanente patienter, med godkendt opsummering, postnummer og aktivt
-- health_data_sharing-samtykke. Matcher verificerede aktive tandlæger (max 10, nærmeste først).
create or replace function public.send_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.requests%rowtype;
  v_consent public.consents%rowtype;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user() then
    raise exception 'ACCOUNT_REQUIRED' using errcode = '42501';
  end if;

  select * into v_req from public.requests
   where id = p_request_id and patient_id = v_uid
   for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'NOT_DRAFT' using errcode = 'P0001';
  end if;
  if v_req.summary_text is null or v_req.summary_approved_at is null then
    raise exception 'SUMMARY_NOT_APPROVED' using errcode = 'P0001';
  end if;
  if v_req.postal_code is null then
    raise exception 'POSTAL_CODE_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_consent from public.consents
   where patient_id = v_uid and type = 'health_data_sharing'
   order by granted_at desc, created_at desc
   limit 1;
  if not found or v_consent.withdrawn_at is not null then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;

  with origin as (
    select pc.lat, pc.lng from public.postal_codes pc where pc.postal_code = v_req.postal_code
  ),
  candidates as (
    select d.id as dentist_id,
           (2 * 6371 * asin(sqrt(
             power(sin(radians(cc.lat - o.lat) / 2), 2)
             + cos(radians(o.lat)) * cos(radians(cc.lat)) * power(sin(radians(cc.lng - o.lng) / 2), 2)
           )))::numeric(6, 2) as distance_km
      from public.dentists d
      join public.clinics c on c.id = d.clinic_id
      join public.postal_codes cc on cc.postal_code = c.postal_code
      cross join origin o
     where d.is_verified
       and d.is_active
       and d.accepts_cosmetic
       and v_req.category = any (d.cosmetic_categories)
  )
  insert into public.request_recipients (request_id, dentist_id, distance_km)
  select p_request_id, ca.dentist_id, ca.distance_km
    from candidates ca
   where ca.distance_km <= v_req.max_distance_km
   order by ca.distance_km
   limit 10;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'NO_MATCHES' using errcode = 'P0001';
  end if;

  perform set_config('tm.transition', 'on', true);
  update public.requests
     set status = 'sent',
         sent_at = now(),
         expires_at = now() + interval '14 days',
         sharing_consent_id = v_consent.id
   where id = p_request_id;
  perform set_config('tm.transition', '', true);

  update public.ai_conversations
     set status = 'closed'
   where request_id = p_request_id and status = 'active';

  return v_count;
end;
$$;

revoke all on function public.send_request(uuid) from public, anon;
grant execute on function public.send_request(uuid) to authenticated;
