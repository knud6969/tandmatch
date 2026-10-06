-- Sikkerhedsfund (security-gennemgang). Ny migration; ingen ændring af eksisterende migrationer.

-- 1. Billeder skrives KUN af serveren (service role), efter re-encoding i sharp.
--    Patienter kan ikke indsætte request_images-rækker eller storage-objekter direkte.
drop policy if exists request_images_insert_owner on public.request_images;
drop policy if exists request_images_delete_owner on public.request_images;
drop policy if exists request_images_storage_insert on storage.objects;
drop policy if exists request_images_storage_delete on storage.objects;
revoke insert, update, delete on public.request_images from authenticated, anon;
grant select, insert, update, delete on public.request_images to service_role;

-- Serverens indsættelse (service role) omgår RLS, så triggeren håndhæver reglerne selv:
-- billedet skal tilhøre en kladde og et aktivt image_upload-samtykke, som er gældende for patienten.
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
  if new.storage_path <> new.patient_id::text || '/' || new.request_id::text || '/' || new.id::text || '.jpg' then
    raise exception 'Ugyldig filsti' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.requests r
    where r.id = new.request_id and r.patient_id = new.patient_id and r.status = 'draft'
  ) then
    raise exception 'Billeder kan kun knyttes til en kladde' using errcode = '42501';
  end if;
  -- Samtykket skal være det seneste image_upload for patienten, og det må ikke være trukket tilbage.
  if not exists (
    select 1 from public.consents c
    where c.id = new.consent_id
      and c.patient_id = new.patient_id
      and c.type = 'image_upload'
      and c.withdrawn_at is null
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

-- 2. Tandlæger ser ikke requests-rækken. Patienten er eneste SELECT-vej til egne rækker.
--    Tandlægens data hentes via funktionen dentist_inbox(), som kun returnerer de felter, der må ses.
drop policy if exists requests_select_owner_or_recipient on public.requests;
create policy requests_select_owner on public.requests
  for select
  using (patient_id = (select auth.uid()));

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
    and (p_status is null or rr.status::text = p_status)
  order by rr.created_at desc
  limit 100;
$fn$;

revoke all on function public.dentist_inbox(text) from public, anon;
grant execute on function public.dentist_inbox(text) to authenticated;

-- 3. Rate limit pr. nøgle (IP + scope) pr. time. Kun serverens service role må kalde den.
create table public.rate_limits (
  key text primary key check (char_length(key) between 1 and 200),
  hits integer not null default 0 check (hits >= 0)
);

alter table public.rate_limits enable row level security;
-- Ingen policies: kun funktionen nedenfor.

create or replace function public.consume_rate_limit(p_key text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_window text := to_char(now() at time zone 'utc', 'YYYYMMDDHH24');
  v_key text := p_key || ':' || v_window;
  v_ok boolean;
begin
  if p_limit < 1 or char_length(p_key) > 150 then
    return false;
  end if;
  -- Ryd gamle vinduer (oprydning sker ved kald, ingen ekstra scheduler nødvendig).
  delete from public.rate_limits where key < p_key || ':' || to_char((now() - interval '2 hours') at time zone 'utc', 'YYYYMMDDHH24')
    and key like p_key || ':%';
  insert into public.rate_limits as r (key, hits)
  values (v_key, 1)
  on conflict (key) do update set hits = r.hits + 1 where r.hits < p_limit
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$fn$;

revoke all on function public.consume_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer) to service_role;

-- 4. Samtykker: granted_at og created_at sættes af serveren (ikke klienten), og teksten skal være en kendt version.
create table public.consent_text_versions (
  type public.consent_type not null,
  text_version text primary key check (char_length(text_version) between 1 and 80)
);

alter table public.consent_text_versions enable row level security;
create policy consent_text_versions_select_public on public.consent_text_versions
  for select
  using (true);
-- Nye versioner tilføjes med migration (ingen skrivepolicy).

insert into public.consent_text_versions (type, text_version) values
  ('ai_processing', 'ai_processing@v0-prototype'),
  ('image_upload', 'image_upload@v0-prototype'),
  ('health_data_sharing', 'health_data_sharing@v0-prototype');

create or replace function public.is_allowed_consent_text(p_type public.consent_type, p_version text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.consent_text_versions v
    where v.type = p_type and v.text_version = p_version
  );
$fn$;

revoke all on function public.is_allowed_consent_text(public.consent_type, text) from public, anon;
grant execute on function public.is_allowed_consent_text(public.consent_type, text) to authenticated;

create or replace function public.consents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.granted_at := clock_timestamp();
  new.created_at := clock_timestamp();
  new.withdrawn_at := null;
  return new;
end;
$fn$;

create trigger consents_before_insert
  before insert on public.consents
  for each row execute function public.consents_before_insert();

drop policy if exists consents_insert_own on public.consents;
create policy consents_insert_own on public.consents
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.is_allowed_consent_text(type, text_version)
    and (type <> 'health_data_sharing' or public.is_permanent_user())
    and granted_while_anonymous = not public.is_permanent_user()
  );

-- Aktivt samtykke = seneste række (efter created_at, som serveren sætter) af typen.
create or replace function public.has_active_consent(p_type public.consent_type)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select coalesce(
    (
      select c.withdrawn_at is null
      from public.consents c
      where c.patient_id = (select auth.uid())
        and c.type = p_type
      order by c.created_at desc
      limit 1
    ),
    false
  );
$fn$;

-- 5. Revoke default EXECUTE til anon (og PUBLIC) på hjælpefunktioner. Authenticated og service_role beholder adgang.
revoke all on function public.ai_limit(text) from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.auth_role() from public, anon;
revoke all on function public.has_active_consent(public.consent_type) from public, anon;
revoke all on function public.is_request_owner(uuid) from public, anon;
revoke all on function public.is_request_recipient(uuid) from public, anon;
revoke all on function public.is_request_owner_text(text) from public, anon;
revoke all on function public.is_request_recipient_text(text) from public, anon;
revoke all on function public.is_editable_request_text(text) from public, anon;
grant execute on function public.ai_limit(text) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.auth_role() to authenticated, service_role;
grant execute on function public.has_active_consent(public.consent_type) to authenticated, service_role;
grant execute on function public.is_request_owner(uuid) to authenticated, service_role;
grant execute on function public.is_request_recipient(uuid) to authenticated, service_role;
grant execute on function public.is_request_owner_text(text) to authenticated, service_role;
grant execute on function public.is_request_recipient_text(text) to authenticated, service_role;
grant execute on function public.is_editable_request_text(text) to authenticated, service_role;
