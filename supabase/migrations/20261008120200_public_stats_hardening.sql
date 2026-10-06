-- Hærdning af offentlig statistik og tandlægens anmeldelsesliste (reviewer fund trin 5).
-- 1. Prisnøjagtighed og fordeling er null under 3 godkendte anmeldelser.
-- 2. Offentlige anmeldelser og statistik kræver verificeret og aktiv tandlæge.
-- 3. Batch-statistik for listen (ét kald i stedet for N+1).
-- 4. Tandlægen ser ikke afviste anmeldelser eller afviste svar.

-- 1+2+3. Batch-statistik pr. tandlæge-id.
create or replace function public.public_dentist_review_stats_many(p_dentist_ids uuid[])
returns table (
  dentist_id uuid,
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
      r.dentist_id as did,
      count(*)::integer as n,
      avg(r.stars)::numeric as avg_s,
      count(*) filter (where r.price_accuracy = 'as_quoted')::integer as a,
      count(*) filter (where r.price_accuracy = 'slightly_higher')::integer as s,
      count(*) filter (where r.price_accuracy = 'much_higher')::integer as m
    from public.reviews r
    join public.dentists d on d.id = r.dentist_id and d.is_verified and d.is_active
    where r.moderation_status = 'approved'
      and r.dentist_id = any (p_dentist_ids)
    group by r.dentist_id
  )
  select
    ids.id,
    coalesce(g.n, 0),
    case when coalesce(g.n, 0) > 0 then round(g.avg_s, 1) end,
    case when coalesce(g.n, 0) >= 3 then round(100 * (g.a + 0.5 * g.s) / g.n)::integer end,
    case when coalesce(g.n, 0) >= 3 then g.a end,
    case when coalesce(g.n, 0) >= 3 then g.s end,
    case when coalesce(g.n, 0) >= 3 then g.m end
  from unnest(p_dentist_ids) as ids(id)
  left join g on g.did = ids.id;
$fn$;

revoke all on function public.public_dentist_review_stats_many(uuid[]) from public;
grant execute on function public.public_dentist_review_stats_many(uuid[]) to anon, authenticated;

-- Enkelt-version delegerer til batch-funktionen (samme regler).
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
  select s.review_count, s.avg_stars, s.price_accuracy_pct, s.n_as_quoted, s.n_slightly_higher, s.n_much_higher
  from public.public_dentist_review_stats_many(array[p_dentist_id]) s;
$fn$;

-- Offentlige, godkendte anmeldelser: kun verificeret og aktiv tandlæge.
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
  join public.dentists d on d.id = r.dentist_id and d.is_verified and d.is_active
  left join public.review_replies rp on rp.review_id = r.id and rp.moderation_status = 'approved'
  where r.dentist_id = p_dentist_id
    and r.moderation_status = 'approved'
  order by r.created_at desc
  limit 100;
$fn$;

-- 4. Tandlægens liste: afviste anmeldelser og afviste svar vises ikke.
create or replace function public.dentist_reviews()
returns table (
  review_id uuid,
  stars smallint,
  text text,
  price_accuracy public.price_accuracy,
  actual_price integer,
  lacked_transparency boolean,
  transparency_comment text,
  moderation_status public.moderation_status,
  created_at timestamptz,
  reply_id uuid,
  reply_text text,
  reply_status public.moderation_status
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
    r.moderation_status,
    r.created_at,
    rp.id,
    rp.text,
    rp.moderation_status
  from public.reviews r
  left join public.review_replies rp
    on rp.review_id = r.id and rp.moderation_status <> 'rejected'
  where r.dentist_id = (select auth.uid())
    and r.moderation_status <> 'rejected'
    and public.is_permanent_user()
    and public.is_verified_dentist()
  order by r.created_at desc
  limit 200;
$fn$;
