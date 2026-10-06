-- Tandlægens egne anmeldelser inkl. pending, og status på eget svar (architecture 10.9).
-- Kun den anmeldte tandlæge (verificeret) får rækker. Ingen patient-id eller navn.

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
  left join public.review_replies rp on rp.review_id = r.id
  where r.dentist_id = (select auth.uid())
    and public.is_permanent_user()
    and public.is_verified_dentist()
  order by r.created_at desc
  limit 200;
$fn$;

revoke all on function public.dentist_reviews() from public, anon;
grant execute on function public.dentist_reviews() to authenticated;
