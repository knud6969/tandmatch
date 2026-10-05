-- Trin 2: billeder i privat bucket og storage-policies (architecture 9.1-9.4).
-- Billeder er helbredsdata: ingen offentlige URL'er. Adgang kun via signerede URL'er (5 min) fra API'et.

create type public.image_view as enum ('front', 'upper', 'lower', 'side_left', 'side_right', 'unclear');
create type public.image_quality as enum ('ok', 'too_dark', 'blurry', 'wrong_angle', 'not_teeth');

create table public.request_images (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  consent_id uuid not null references public.consents (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 200),
  ai_view public.image_view null,
  ai_quality public.image_quality null,
  ai_description text null check (ai_description is null or char_length(ai_description) <= 500),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  bytes integer not null check (bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index request_images_request_idx on public.request_images (request_id);
create index request_images_patient_idx on public.request_images (patient_id);

-- Max 5 billeder pr. forespørgsel, og stien skal følge {patient_id}/{request_id}/{id}.jpg.
create or replace function public.request_images_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.request_images i where i.request_id = new.request_id) >= 5 then
    raise exception 'IMAGE_LIMIT' using errcode = 'P0001';
  end if;
  if new.storage_path <> new.patient_id::text || '/' || new.request_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Ugyldig filsti' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger request_images_before_insert
  before insert on public.request_images
  for each row execute function public.request_images_before_insert();

alter table public.request_images enable row level security;

create policy request_images_select_owner_or_recipient on public.request_images
  for select
  using (patient_id = (select auth.uid()) or public.is_request_recipient(request_id));

create policy request_images_insert_owner on public.request_images
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.is_request_owner(request_id)
    and public.has_active_consent('image_upload')
    and exists (
      select 1 from public.consents c
      where c.id = consent_id
        and c.patient_id = (select auth.uid())
        and c.type = 'image_upload'
        and c.withdrawn_at is null
    )
    and exists (
      select 1 from public.requests r
      where r.id = request_id and r.status = 'draft'
    )
  );

create policy request_images_delete_owner on public.request_images
  for delete
  using (patient_id = (select auth.uid()));

-- Upload kun til ejers kladde (ikke sendte forespørgsler). Ugyldigt uuid giver false.
create or replace function public.is_editable_request_text(p_request_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_request_id is null or p_request_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  return exists (
    select 1 from public.requests r
    where r.id = p_request_id::uuid
      and r.patient_id = (select auth.uid())
      and r.status = 'draft'
  );
end;
$fn$;

-- Bucket: privat, kun JPEG efter re-encoding, max 4 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-images', 'request-images', false, 4194304, array['image/jpeg'])
on conflict (id) do nothing;

-- Storage-policies. Sti: {patient_id}/{request_id}/{image_id}.jpg (præcis tre segmenter).
create policy request_images_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.is_editable_request_text((storage.foldername(name))[2])
    and public.has_active_consent('image_upload')
  );

create policy request_images_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'request-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.is_request_recipient_text((storage.foldername(name))[2])
    )
  );

create policy request_images_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Ingen UPDATE-policy: filer erstattes ikke.
