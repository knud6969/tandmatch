-- Del 7: sagens billeder og storage-buckets (architecture 4.3 case_images, 9.1-9.5).
-- Billeder er helbredsdata: privat bucket, ingen storage-policies for authenticated/anon, signerede URL'er fra serveren.

create table public.case_images (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  consent_id uuid not null references public.consents (id) on delete cascade,
  storage_path text not null unique check (char_length(storage_path) <= 200),
  ai_view public.image_view null,
  ai_quality public.image_quality null,
  ai_description text null check (char_length(ai_description) <= 500),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  bytes integer not null check (bytes between 1 and 4194304),
  created_at timestamptz not null default now()
);

create index case_images_case_idx on public.case_images (case_id);
create index case_images_patient_idx on public.case_images (patient_id);

-- Indsættes kun af service role. Triggeren håndhæver reglerne i databasen:
-- max 5 pr. sag, sti {case_id}/{id}.jpg, kun kladde, aktivt og seneste image_upload-samtykke med AI-oplysning,
-- og for anonyme højst 20 MB samlet.
create function public.case_images_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_anonymous boolean;
begin
  perform 1 from public.cases c where c.id = new.case_id for update;
  if (select count(*) from public.case_images i where i.case_id = new.case_id) >= 5 then
    raise exception 'IMAGE_LIMIT' using errcode = 'P0001';
  end if;
  if new.storage_path <> new.case_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Ugyldig filsti' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.cases c where c.id = new.case_id and c.patient_id = new.patient_id and c.status = 'draft'
  ) then
    raise exception 'Billeder kan kun knyttes til en kladde' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.consents c
     where c.id = new.consent_id and c.patient_id = new.patient_id and c.type = 'image_upload'
       and c.withdrawn_at is null
       and exists (select 1 from public.consent_text_versions v
                    where v.type = 'image_upload' and v.text_version = c.text_version and v.ai_disclosure)
  ) or (
    select c.id from public.consents c
     where c.patient_id = new.patient_id and c.type = 'image_upload'
     order by c.created_at desc limit 1
  ) is distinct from new.consent_id then
    raise exception 'CONSENT_REQUIRED' using errcode = '42501';
  end if;
  select p.is_anonymous into v_anonymous from public.profiles p where p.id = new.patient_id;
  if coalesce(v_anonymous, false)
     and (select coalesce(sum(i.bytes), 0) from public.case_images i where i.patient_id = new.patient_id) + new.bytes > 20971520 then
    raise exception 'STORAGE_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger case_images_before_insert
  before insert on public.case_images
  for each row execute function public.case_images_before_insert();

-- Billedændringer nulstiller godkendelsen af opsummeringen (kun kladder).
create function public.case_images_reset_approval()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform set_config('tm.system', 'on', true);
  update public.cases
     set summary_approved_at = null
   where id = case when tg_op = 'DELETE' then old.case_id else new.case_id end
     and status = 'draft' and summary_approved_at is not null;
  perform set_config('tm.system', '', true);
  return null;
end;
$$;

create trigger case_images_reset_approval
  after insert or delete on public.case_images
  for each row execute function public.case_images_reset_approval();

revoke all on function public.case_images_before_insert() from public, anon, authenticated;
revoke all on function public.case_images_reset_approval() from public, anon, authenticated;

alter table public.case_images enable row level security;

create policy case_images_select_own on public.case_images
  for select to authenticated using (patient_id = (select auth.uid()));
-- Ingen insert/update/delete for authenticated: kun service role (9.3). Klinikker læser via clinic_lead_images().
revoke insert, update, delete, truncate on public.case_images from authenticated;

-- Buckets. case-images: privat, kun JPEG efter re-encoding. public-media: offentlig læsning (public bucket),
-- skrivning kun med service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('case-images', 'case-images', false, 4194304, array['image/jpeg']),
  ('public-media', 'public-media', true, 4194304, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Bevidst ingen policies på storage.objects for authenticated/anon (9.2, 9.5). Public-media serveres som
-- offentlig bucket uden policy; skrivning, sletning og signering sker med service role efter serverens tjek.
