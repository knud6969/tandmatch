-- Regressionsrettelser efter sikkerhedshærdningen (reviewer runde 4).
-- 1. Tandlæger slår status op via dentist_request_status() (ikke requests-SELECT).
-- 2. dentist_inbox() og modtager-storage kræver også is_verified_dentist().
-- 3. request_images: ingen direkte tandlæge-læsning. Kun dentist_request_images().
-- 4. Recipient-status følger svaret: responded ved svar, tilbage til new/seen ved tilbagetrækning.

-- 1. Status for en modtaget forespørgsel. Ingen patient_id, ingen opsummering.
create or replace function public.dentist_request_status(p_request_id uuid)
returns table (request_id uuid, request_status public.request_status, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.id, r.status, r.expires_at
  from public.requests r
  join public.request_recipients rr on rr.request_id = r.id and rr.dentist_id = (select auth.uid())
  where r.id = p_request_id
    and r.status <> 'draft'
    and public.is_permanent_user()
    and public.is_verified_dentist();
$fn$;

revoke all on function public.dentist_request_status(uuid) from public, anon;
grant execute on function public.dentist_request_status(uuid) to authenticated;

-- 2a. Indbakke: kræver verificeret tandlæge.
create or replace function public.dentist_inbox(p_status text default null)
returns table (
  request_id uuid,
  category public.cosmetic_category,
  postal_code text,
  city text,
  distance_km numeric,
  recipient_status public.recipient_status,
  request_status public.request_status,
  sent_at timestamptz,
  expires_at timestamptz,
  summary_text text,
  image_count bigint
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
    rr.distance_km,
    rr.status,
    r.status,
    r.sent_at,
    r.expires_at,
    case when r.summary_approved_at is not null then r.summary_text end,
    (select count(*) from public.request_images i where i.request_id = r.id)
  from public.request_recipients rr
  join public.requests r on r.id = rr.request_id
  left join public.postal_codes pc on pc.postal_code = r.postal_code
  where rr.dentist_id = (select auth.uid())
    and r.status <> 'draft'
    and public.is_permanent_user()
    and public.is_verified_dentist()
    and (p_status is null or rr.status::text = p_status)
  order by rr.created_at desc
  limit 100;
$fn$;

-- 2b. Storage: modtagere skal også være verificerede.
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
        and public.is_verified_dentist()
        and public.is_shared_image_path(name)
      )
    )
  );

-- 3. request_images: kun patientens egne rækker. Tandlæger får billeder via dentist_request_images().
drop policy if exists request_images_select_owner_or_recipient on public.request_images;
create policy request_images_select_owner on public.request_images
  for select
  using (patient_id = (select auth.uid()));

-- 4. Recipient-status synkroniseres med svaret.
create or replace function public.responses_sync_recipient_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'INSERT' and new.status = 'sent' then
    update public.request_recipients rr
       set status = 'responded'
     where rr.request_id = new.request_id and rr.dentist_id = new.dentist_id;
  elsif tg_op = 'UPDATE' and new.status = 'withdrawn' and old.status = 'sent' then
    update public.request_recipients rr
       set status = case when rr.seen_at is not null then 'seen'::public.recipient_status else 'new'::public.recipient_status end
     where rr.request_id = new.request_id and rr.dentist_id = new.dentist_id;
  end if;
  return null;
end;
$fn$;

revoke all on function public.responses_sync_recipient_status() from public, anon, authenticated;

drop trigger if exists responses_after_insert on public.responses;
create trigger responses_sync_recipient_status
  after insert or update of status on public.responses
  for each row execute function public.responses_sync_recipient_status();
