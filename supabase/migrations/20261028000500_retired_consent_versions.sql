-- Pensionerede samtykkeversioner og samlet tilbagetrækning (architecture 4.3, 5.3, 11; security 7.11 M1 og M2).
-- Eksisterende samtykkerækker ændres ikke; et v0-delingssamtykke bliver stående, men er ikke længere gældende.

alter table public.consent_text_versions add column retired_at timestamptz null;

-- Delingssamtykket v0 er afløst af v1-klinikker (20261028000200).
update public.consent_text_versions set retired_at = now() where text_version = 'health_data_sharing@v0-prototype';

-- Kun ikke-pensionerede versioner må gives (bruges af RLS-policyen consents_insert_own).
create or replace function public.is_allowed_consent_text(p_type public.consent_type, p_version text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.consent_text_versions v
     where v.type = p_type and v.text_version = p_version and v.retired_at is null
  );
$$;

-- Gældende samtykke: seneste række af typen er ikke trukket tilbage og dens tekstversion er ikke pensioneret.
create or replace function public.has_active_consent(p_type public.consent_type)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select c.withdrawn_at is null and v.retired_at is null
       from public.consents c
       join public.consent_text_versions v on v.text_version = c.text_version
      where c.patient_id = (select auth.uid()) and c.type = p_type
      order by c.created_at desc
      limit 1),
    false);
$$;

-- Tilbagetrækning gælder typen: alle patientens aktive samtykker af typen trækkes tilbage, uanset version,
-- og konsekvensen udløses altid.
create or replace function public.withdraw_consent(p_consent_id uuid)
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

  -- Alle aktive samtykker af typen (den valgte række og andre versioner) får samme tidspunkt.
  update public.consents c set withdrawn_at = v_at
   where c.patient_id = v_uid and c.type = v_consent.type and c.withdrawn_at is null;

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
    v_leads := public.withdraw_open_leads(v_uid, null);
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

-- create or replace bevarer grants, men de gentages, så filen kan læses alene.
revoke all on function public.has_active_consent(public.consent_type) from public, anon;
revoke all on function public.is_allowed_consent_text(public.consent_type, text) from public, anon;
revoke all on function public.withdraw_consent(uuid) from public, anon;
grant execute on function public.has_active_consent(public.consent_type) to authenticated, service_role;
grant execute on function public.is_allowed_consent_text(public.consent_type, text) to authenticated, service_role;
grant execute on function public.withdraw_consent(uuid) to authenticated;
