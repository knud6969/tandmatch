-- Sikkerhedsfund (security-gennemgang 29687ebf).
-- 1. Billedstien indeholder ikke længere patient_id. Nye uploads: {request_id}/{image_id}.jpg.
-- 2. Tandlæger kan ikke læse visits.patient_id. Læsning sker via dentist_visits() (ingen patient-id).
-- 3. Samtykketeksten til billeder skal nævne AI-tjenesten. Ny version, håndhævet ved upload.

-- 1a. Ny sti-regel og krav om den gyldige image_upload-version (ai_disclosure) i billedtriggeren.
create or replace function public.request_images_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select count(*) from public.request_images i where i.request_id = new.request_id) >= 5 then
    raise exception 'IMAGE_LIMIT' using errcode = 'P0001';
  end if;
  -- Ny sti uden patient_id: {request_id}/{image_id}.jpg. Forhindrer at signerede URL'er afslører patienten.
  if new.storage_path <> new.request_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Ugyldig filsti' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.requests r
    where r.id = new.request_id and r.patient_id = new.patient_id and r.status = 'draft'
  ) then
    raise exception 'Billeder kan kun knyttes til en kladde' using errcode = '42501';
  end if;
  -- Samtykket skal være det seneste image_upload for patienten, ikke trukket tilbage, og af den gyldige version
  -- (den version der oplyser om AI-behandling af billedet, jf. consent_text_versions.ai_disclosure).
  if not exists (
    select 1 from public.consents c
    where c.id = new.consent_id
      and c.patient_id = new.patient_id
      and c.type = 'image_upload'
      and c.withdrawn_at is null
      and exists (
        select 1 from public.consent_text_versions v
        where v.type = 'image_upload' and v.text_version = c.text_version and v.ai_disclosure
      )
  ) or (
    select c.id from public.consents c
    where c.patient_id = new.patient_id and c.type = 'image_upload'
    order by c.created_at desc
    limit 1
  ) is distinct from new.consent_id then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- 1b. Storage-policy: ejerskab afgøres af forespørgslen (mappe 1 = request_id), ikke af patient_id.
drop policy if exists request_images_storage_select on storage.objects;
create policy request_images_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'request-images'
    and (
      public.is_request_owner_text((storage.foldername(name))[1])
      or (
        public.is_request_recipient_text((storage.foldername(name))[1])
        and public.is_verified_dentist()
        and public.is_shared_image_path(name)
      )
    )
  );

-- 2. visits: tandlæger kan ikke læse patient_id. Kun patienten (ejer) og admin har direkte SELECT.
drop policy if exists visits_select_party on public.visits;
create policy visits_select_patient_or_admin on public.visits
  for select
  using (
    patient_id = (select auth.uid())
    or public.is_admin()
  );

-- Tandlægens egen læsning: ingen patient-id eller andre identificerbare felter.
create or replace function public.dentist_visits()
returns table (
  visit_id uuid,
  response_id uuid,
  visited_on date,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select v.id, v.response_id, v.visited_on, v.verified_at
  from public.visits v
  where v.dentist_id = (select auth.uid())
    and public.is_permanent_user()
    and public.is_verified_dentist();
$fn$;

revoke all on function public.dentist_visits() from public, anon;
grant execute on function public.dentist_visits() to authenticated;

-- 3. Samtykketekst til billeder: ny version, der oplyser om AI-behandling. Gamle samtykker forbliver gyldige
-- (rækkerne slettes ikke), men nye uploads kræver den nye version (ai_disclosure, håndhævet i triggeren ovenfor).
alter table public.consent_text_versions add column if not exists ai_disclosure boolean not null default false;

insert into public.consent_text_versions (type, text_version, ai_disclosure) values
  ('image_upload', 'image_upload@v1-ai-disclosure', true)
on conflict (text_version) do update set ai_disclosure = true;
