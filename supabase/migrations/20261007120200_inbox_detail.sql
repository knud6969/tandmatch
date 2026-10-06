-- Tandlægens forespørgselsvisning (architecture 10.6). Tandlæger læser requests via funktioner, ikke direkte.
-- Kun modtagere af en SENDT forespørgsel, og kun verificerede tandlæger, får data.

-- 1. Detaljer for én modtaget forespørgsel. Ingen patient_id, ingen ai_summary, ingen chat.
create or replace function public.dentist_request_detail(p_request_id uuid)
returns table (
  request_id uuid,
  category public.cosmetic_category,
  postal_code text,
  city text,
  request_status public.request_status,
  sent_at timestamptz,
  expires_at timestamptz,
  summary_text text,
  answers jsonb,
  distance_km numeric
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    r.id,
    r.category,
    r.postal_code,
    pc.city,
    r.status,
    r.sent_at,
    r.expires_at,
    case when r.summary_approved_at is not null then r.summary_text end,
    r.answers,
    rr.distance_km
  from public.requests r
  join public.request_recipients rr on rr.request_id = r.id and rr.dentist_id = (select auth.uid())
  left join public.postal_codes pc on pc.postal_code = r.postal_code
  where r.id = p_request_id
    and r.status <> 'draft'
    and public.is_permanent_user()
    and public.is_verified_dentist();
$fn$;

-- 2. Billeder til modtageren: kun billeder, hvor patientens image_upload-samtykke ikke er trukket tilbage.
create or replace function public.dentist_request_images(p_request_id uuid)
returns table (
  image_id uuid,
  storage_path text,
  ai_view public.image_view,
  ai_quality public.image_quality
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select i.id, i.storage_path, i.ai_view, i.ai_quality
  from public.request_images i
  join public.consents c on c.id = i.consent_id
  where i.request_id = p_request_id
    and c.withdrawn_at is null
    and public.is_request_recipient(p_request_id)
    and public.is_permanent_user()
    and public.is_verified_dentist()
  order by i.created_at;
$fn$;

-- 3. Storage: modtagere må kun hente billedfiler, der er delt (aktivt samtykke) og hører til en sendt forespørgsel.
create or replace function public.is_shared_image_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from public.request_images i
    join public.consents c on c.id = i.consent_id
    where i.storage_path = p_name
      and c.withdrawn_at is null
  );
$fn$;

drop policy if exists request_images_storage_select on storage.objects;
create policy request_images_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'request-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (
        public.is_request_recipient_text((storage.foldername(name))[2])
        and public.is_shared_image_path(name)
      )
    )
  );

-- 4. Rettigheder: kun authenticated, ikke anon.
revoke all on function public.dentist_request_detail(uuid) from public, anon;
grant execute on function public.dentist_request_detail(uuid) to authenticated;
revoke all on function public.dentist_request_images(uuid) from public, anon;
grant execute on function public.dentist_request_images(uuid) to authenticated;
revoke all on function public.is_shared_image_path(text) from public, anon;
grant execute on function public.is_shared_image_path(text) to authenticated;
