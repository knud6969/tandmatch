-- Byggetrin 5: standard-sporet, besøg, anmeldelser og prisnøjagtighed (architecture 4.2, 4.3, 8, 10.8, 10.9).
-- Offentlig læsning af tandlæger, priser og godkendte anmeldelser sker via security definer-funktioner.
-- Anon må ikke læse dentists/profiles/reviews direkte.

-- 1. Enums (pladsholdere, jf. 4.2).
create type public.standard_service as enum ('undersoegelse', 'tandrensning', 'fyldning', 'akut_konsultation');
create type public.price_accuracy as enum ('as_quoted', 'slightly_higher', 'much_higher');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');

-- 2. Priser pr. klinik og ydelse. Offentlige. Skrives af klinikkens tandlæger.
create table public.clinic_prices (
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  service public.standard_service not null,
  price_min integer not null check (price_min >= 0),
  price_max integer not null check (price_max >= price_min and price_max <= 1000000),
  note text null check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  primary key (clinic_id, service)
);

alter table public.clinic_prices enable row level security;

create policy clinic_prices_select_public on public.clinic_prices
  for select
  using (true);

create policy clinic_prices_write_member on public.clinic_prices
  for all
  using (
    exists (select 1 from public.dentists d where d.id = (select auth.uid()) and d.clinic_id = clinic_prices.clinic_id)
    and public.is_permanent_user()
  )
  with check (
    exists (select 1 from public.dentists d where d.id = (select auth.uid()) and d.clinic_id = clinic_prices.clinic_id)
    and public.is_permanent_user()
  );

-- 3. Besøg. Oprettes KUN af seed (MVP, 8.1). Patient og tandlæge ser egne.
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  response_id uuid null references public.responses (id) on delete set null,
  visited_on date not null,
  verification_method text null check (verification_method is null or char_length(verification_method) <= 40),
  verified_at timestamptz null,
  created_at timestamptz not null default now()
);

create index visits_patient_idx on public.visits (patient_id);
create index visits_dentist_idx on public.visits (dentist_id);

alter table public.visits enable row level security;

create policy visits_select_party on public.visits
  for select
  using (
    patient_id = (select auth.uid())
    or dentist_id = (select auth.uid())
    or public.is_admin()
  );
-- Ingen INSERT/UPDATE/DELETE-policies: kun seed (owner) skriver besøg i MVP.

-- 4. Anmeldelser. Kun patienter med verificeret besøg. Kun godkendte vises offentligt.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  text text not null check (char_length(btrim(text)) between 20 and 2000),
  price_accuracy public.price_accuracy not null,
  actual_price integer null check (actual_price is null or (actual_price >= 0 and actual_price <= 1000000)),
  lacked_transparency boolean null,
  transparency_comment text null check (transparency_comment is null or char_length(transparency_comment) <= 1000),
  moderation_status public.moderation_status not null default 'pending',
  moderated_by uuid null references public.profiles (id) on delete set null,
  moderated_at timestamptz null,
  rejection_reason text null check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now()
);

create index reviews_dentist_idx on public.reviews (dentist_id);

-- Trigger: dentist_id udledes fra besøget, status tvinges til pending, og besøget skal være verificeret.
create or replace function public.reviews_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_visit public.visits%rowtype;
begin
  select * into v_visit from public.visits where id = new.visit_id;
  if not found or v_visit.verified_at is null or v_visit.patient_id is distinct from new.patient_id then
    raise exception 'VISIT_NOT_VERIFIED' using errcode = '42501';
  end if;
  new.dentist_id := v_visit.dentist_id;
  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  return new;
end;
$fn$;

create trigger reviews_before_insert
  before insert on public.reviews
  for each row execute function public.reviews_before_insert();

-- Ændring af anmeldelser sker kun via moderation (admin) i en senere migration. Patienter har ingen UPDATE-policy.
create or replace function public.reviews_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.visit_id is distinct from old.visit_id
     or new.dentist_id is distinct from old.dentist_id
     or new.patient_id is distinct from old.patient_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if (new.moderation_status is distinct from old.moderation_status
      or new.moderated_by is distinct from old.moderated_by
      or new.moderated_at is distinct from old.moderated_at
      or new.rejection_reason is distinct from old.rejection_reason)
     and coalesce(current_setting('tm.system', true), '') <> 'on' then
    raise exception 'Feltet ændres kun af moderation' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger reviews_guard_update
  before update on public.reviews
  for each row execute function public.reviews_guard_update();

alter table public.reviews enable row level security;

-- Patienten ser egne anmeldelser (også pending/afvist). Offentlige læses via public_reviews().
create policy reviews_select_own on public.reviews
  for select
  using (patient_id = (select auth.uid()) or public.is_admin());

create policy reviews_insert_verified_visit on public.reviews
  for insert
  with check (
    patient_id = (select auth.uid())
    and public.auth_role() = 'patient'
    and public.is_permanent_user()
    and exists (
      select 1 from public.visits v
      where v.id = visit_id
        and v.patient_id = (select auth.uid())
        and v.verified_at is not null
    )
  );

-- 5. Svar på anmeldelse. Kun den anmeldte tandlæge. Pending indtil admin godkender.
create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews (id) on delete cascade,
  dentist_id uuid not null references public.dentists (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 1000),
  moderation_status public.moderation_status not null default 'pending',
  moderated_by uuid null references public.profiles (id) on delete set null,
  moderated_at timestamptz null,
  rejection_reason text null check (rejection_reason is null or char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now()
);

create or replace function public.review_replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_review public.reviews%rowtype;
begin
  select * into v_review from public.reviews where id = new.review_id;
  if not found or v_review.dentist_id is distinct from new.dentist_id or v_review.moderation_status <> 'approved' then
    raise exception 'REVIEW_NOT_ELIGIBLE' using errcode = '42501';
  end if;
  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  return new;
end;
$fn$;

create trigger review_replies_before_insert
  before insert on public.review_replies
  for each row execute function public.review_replies_before_insert();

create or replace function public.review_replies_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.review_id is distinct from old.review_id or new.dentist_id is distinct from old.dentist_id then
    raise exception 'Feltet kan ikke ændres' using errcode = '42501';
  end if;
  if (new.moderation_status is distinct from old.moderation_status
      or new.moderated_by is distinct from old.moderated_by
      or new.moderated_at is distinct from old.moderated_at
      or new.rejection_reason is distinct from old.rejection_reason)
     and coalesce(current_setting('tm.system', true), '') <> 'on' then
    raise exception 'Feltet ændres kun af moderation' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger review_replies_guard_update
  before update on public.review_replies
  for each row execute function public.review_replies_guard_update();

alter table public.review_replies enable row level security;

create policy review_replies_select_own on public.review_replies
  for select
  using (dentist_id = (select auth.uid()) or public.is_admin());

-- Hjælper (security definer): tandlægen er den anmeldte. Tandlæger har ingen SELECT-policy på reviews.
create or replace function public.review_is_for_me(p_review_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.reviews r
    where r.id = p_review_id and r.dentist_id = (select auth.uid())
  );
$fn$;

revoke all on function public.review_is_for_me(uuid) from public, anon;
grant execute on function public.review_is_for_me(uuid) to authenticated;

create policy review_replies_insert_reviewed_dentist on public.review_replies
  for insert
  with check (
    dentist_id = (select auth.uid())
    and public.auth_role() = 'dentist'
    and public.is_permanent_user()
    and public.is_verified_dentist()
    and public.review_is_for_me(review_id)
  );

-- 6. Offentlige funktioner (anon og authenticated). Returnerer kun offentlige felter.

-- 6a. Tandlæger til standard-sporet (kun verificerede og aktive). Afstand fra patientens postnummer.
create or replace function public.public_dentists(p_postal_code text default null, p_dentist_id uuid default null)
returns table (
  dentist_id uuid,
  full_name text,
  title text,
  bio text,
  photo_path text,
  accepts_cosmetic boolean,
  cosmetic_categories text[],
  clinic_id uuid,
  clinic_name text,
  clinic_address text,
  clinic_postal_code text,
  clinic_city text,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  next_available_at timestamptz,
  distance_km numeric
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    d.id,
    d.full_name,
    d.title,
    d.bio,
    d.photo_path,
    d.accepts_cosmetic,
    d.cosmetic_categories::text[],
    c.id,
    c.name,
    c.address,
    c.postal_code,
    c.city,
    c.phone,
    c.website,
    c.trustpilot_url,
    c.trustpilot_score,
    c.trustpilot_review_count,
    c.trustpilot_updated_at,
    case when d.next_available_updated_at > now() - interval '7 days' then d.next_available_at end,
    case
      when o.lat is not null and pc.lat is not null then
        (2 * 6371 * asin(sqrt(
          power(sin(radians(pc.lat - o.lat) / 2), 2)
          + cos(radians(o.lat)) * cos(radians(pc.lat)) * power(sin(radians(pc.lng - o.lng) / 2), 2)
        )))::numeric(6, 2)
    end
  from public.dentists d
  join public.clinics c on c.id = d.clinic_id
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  left join lateral (
    select pco.lat, pco.lng from public.postal_codes pco where pco.postal_code = p_postal_code
  ) o on true
  where d.is_verified
    and d.is_active
    and (p_dentist_id is null or d.id = p_dentist_id)
  order by 20 nulls last, d.full_name;
$fn$;

-- 6b. Offentlige, godkendte anmeldelser (uden patient_id). Svar kun når det er godkendt.
create or replace function public.public_reviews(p_dentist_id uuid)
returns table (
  review_id uuid,
  stars smallint,
  text text,
  price_accuracy public.price_accuracy,
  actual_price integer,
  lacked_transparency boolean,
  transparency_comment text,
  created_month text,
  reply_text text,
  reply_created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    r.id,
    r.stars,
    r.text,
    r.price_accuracy,
    r.actual_price,
    r.lacked_transparency,
    r.transparency_comment,
    to_char(r.created_at at time zone 'utc', 'YYYY-MM'),
    rp.text,
    rp.created_at
  from public.reviews r
  left join public.review_replies rp on rp.review_id = r.id and rp.moderation_status = 'approved'
  where r.dentist_id = p_dentist_id
    and r.moderation_status = 'approved'
  order by r.created_at desc
  limit 100;
$fn$;

-- 6c. Samlet statistik. Prisnøjagtighed = (ja*1.0 + lidt højere*0.5) / antal, kun ved mindst 3 godkendte (8.3).
create or replace function public.public_dentist_review_stats(p_dentist_id uuid)
returns table (
  review_count integer,
  avg_stars numeric,
  price_accuracy_pct integer,
  n_as_quoted integer,
  n_slightly_higher integer,
  n_much_higher integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with g as (
    select
      count(*)::integer as n,
      avg(r.stars)::numeric as avg_s,
      count(*) filter (where r.price_accuracy = 'as_quoted')::integer as a,
      count(*) filter (where r.price_accuracy = 'slightly_higher')::integer as s,
      count(*) filter (where r.price_accuracy = 'much_higher')::integer as m
    from public.reviews r
    where r.dentist_id = p_dentist_id
      and r.moderation_status = 'approved'
  )
  select
    g.n,
    case when g.n > 0 then round(g.avg_s, 1) end,
    case when g.n >= 3 then round(100 * (g.a + 0.5 * g.s) / g.n)::integer end,
    g.a,
    g.s,
    g.m
  from g;
$fn$;

-- 7. Rettigheder: anon må kalde de offentlige funktioner; ingen direkte læsning af tandlæger/anmeldelser.
revoke all on function public.public_dentists(text, uuid) from public;
grant execute on function public.public_dentists(text, uuid) to anon, authenticated;
revoke all on function public.public_reviews(uuid) from public;
grant execute on function public.public_reviews(uuid) to anon, authenticated;
revoke all on function public.public_dentist_review_stats(uuid) from public;
grant execute on function public.public_dentist_review_stats(uuid) to anon, authenticated;
