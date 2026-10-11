-- Del 10: anmeldelser, klinikkens svar og statistik (architecture 4.3, 5.4, 8.1-8.5).
-- Anmeldelse kun efter en gennemført booking (effektiv status completed, dvs. 24 timer efter sluttid, beslutning 16).

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id),
  patient_id uuid not null references public.patients (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  text text not null check (char_length(text) between 20 and 2000),
  price_accuracy public.price_accuracy not null,
  actual_price integer null check (actual_price >= 0),
  lacked_transparency boolean null,
  transparency_comment text null check (char_length(transparency_comment) <= 500),
  moderation_status public.moderation_status not null default 'pending',
  moderated_by uuid null references public.profiles (id) on delete set null,
  moderated_at timestamptz null,
  rejection_reason text null check (char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now()
);

create index reviews_clinic_idx on public.reviews (clinic_id) where moderation_status = 'approved';

create table public.review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews (id) on delete cascade,
  clinic_id uuid not null references public.clinics (id),
  text text not null check (char_length(text) between 1 and 1000),
  moderation_status public.moderation_status not null default 'pending',
  moderated_by uuid null references public.profiles (id) on delete set null,
  moderated_at timestamptz null,
  rejection_reason text null check (char_length(rejection_reason) <= 500),
  created_at timestamptz not null default now()
);

create function public.review_is_for_my_clinic(p_review_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.reviews r
     where r.id = p_review_id and r.clinic_id = (select k.id from public.clinics k where k.owner_id = (select auth.uid()))
  );
$$;

-- Er anmeldelsen godkendt? (Klinikker kan ikke læse reviews direkte, så policyen bruger en funktion.)
create function public.review_is_approved(p_review_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.reviews r where r.id = p_review_id and r.moderation_status = 'approved');
$$;

revoke all on function public.review_is_approved(uuid) from public, anon;
grant execute on function public.review_is_approved(uuid) to authenticated, service_role;

-- Må den indloggede patient anmelde bookingen? Egen booking, verificeret klinik, effektiv status completed.
-- (Funktion, fordi patienter ikke kan læse clinics direkte.)
create function public.can_review_booking(p_booking_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
      join public.clinics k on k.id = b.clinic_id
     where b.id = p_booking_id and b.patient_id = (select auth.uid())
       and k.status = 'verified'
       and public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at) = 'completed'
  );
$$;

revoke all on function public.can_review_booking(uuid) from public, anon;
grant execute on function public.can_review_booking(uuid) to authenticated, service_role;

-- Klinik og patient udledes fra bookingen; moderation tvinges til 'pending'.
create function public.reviews_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select b.clinic_id, b.patient_id into new.clinic_id, new.patient_id
    from public.bookings b where b.id = new.booking_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  return new;
end;
$$;

create trigger reviews_before_insert
  before insert on public.reviews
  for each row execute function public.reviews_before_insert();

create function public.review_replies_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select r.clinic_id into new.clinic_id from public.reviews r where r.id = new.review_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  new.moderation_status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  return new;
end;
$$;

create trigger review_replies_before_insert
  before insert on public.review_replies
  for each row execute function public.review_replies_before_insert();

revoke all on function public.review_is_for_my_clinic(uuid) from public, anon;
grant execute on function public.review_is_for_my_clinic(uuid) to authenticated, service_role;
revoke all on function public.reviews_before_insert() from public, anon, authenticated;
revoke all on function public.review_replies_before_insert() from public, anon, authenticated;

alter table public.reviews enable row level security;
alter table public.review_replies enable row level security;

create policy reviews_select_own_or_admin on public.reviews
  for select to authenticated using (patient_id = (select auth.uid()) or public.is_admin());
create policy reviews_insert_after_completed_booking on public.reviews
  for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and public.is_permanent_user()
    and public.can_review_booking(booking_id)
  );
revoke update, delete, truncate on public.reviews from authenticated;

create policy review_replies_select_own_clinic_or_admin on public.review_replies
  for select to authenticated using (clinic_id = public.auth_clinic_id() or public.is_admin());
create policy review_replies_insert_own_clinic on public.review_replies
  for insert to authenticated
  with check (
    public.review_is_for_my_clinic(review_id)
    and clinic_id = public.auth_clinic_id()
    and exists (select 1 from public.clinics k where k.id = clinic_id and k.status = 'verified')
    and public.review_is_approved(review_id)
  );
revoke update, delete, truncate on public.review_replies from authenticated;

-- Statistik beregnet i databasen (8.3): kun godkendte anmeldelser og kun verificerede klinikker.
-- price_accuracy_pct og fordeling er null ved under 3 anmeldelser.
create function public.public_clinic_review_stats_many(p_clinic_ids uuid[])
returns table (
  clinic_id uuid,
  review_count integer,
  avg_stars numeric,
  as_quoted_count integer,
  slightly_higher_count integer,
  much_higher_count integer,
  price_accuracy_pct integer
)
language sql stable security definer set search_path = ''
as $$
  select k.id,
         count(r.id)::integer,
         round(avg(r.stars), 1),
         case when count(r.id) >= 3 then count(*) filter (where r.price_accuracy = 'as_quoted')::integer end,
         case when count(r.id) >= 3 then count(*) filter (where r.price_accuracy = 'slightly_higher')::integer end,
         case when count(r.id) >= 3 then count(*) filter (where r.price_accuracy = 'much_higher')::integer end,
         case when count(r.id) >= 3 then round(100 * (
           count(*) filter (where r.price_accuracy = 'as_quoted') * 1.0
           + count(*) filter (where r.price_accuracy = 'slightly_higher') * 0.5
         ) / count(r.id))::integer end
    from public.clinics k
    left join public.reviews r on r.clinic_id = k.id and r.moderation_status = 'approved'
   where k.id = any (p_clinic_ids) and k.status = 'verified'
   group by k.id;
$$;

revoke all on function public.public_clinic_review_stats_many(uuid[]) from public, anon;
grant execute on function public.public_clinic_review_stats_many(uuid[]) to anon, authenticated, service_role;
