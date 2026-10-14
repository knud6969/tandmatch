-- public_reviews() returnerede date_trunc('month', created_at) som timestamptz i UTC, så en anmeldelse skrevet
-- 1. november kl. 00.30 dansk tid kom ud som oktober. Funktionen returnerer nu det rå tidsstempel, og
-- ClinicDirectoryRepository mapper til "YYYY-MM" i dansk tid. Ellers uændret (samme filtre, samme rettigheder).
drop function public.public_reviews(uuid);

create function public.public_reviews(p_clinic_id uuid)
returns table (
  review_id uuid,
  stars smallint,
  text text,
  price_accuracy public.price_accuracy,
  actual_price integer,
  lacked_transparency boolean,
  transparency_comment text,
  created_at timestamptz,
  reply_text text,
  reply_created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.stars, r.text, r.price_accuracy, r.actual_price, r.lacked_transparency, r.transparency_comment,
         r.created_at, rr.text, rr.created_at
    from public.reviews r
    join public.clinics k on k.id = r.clinic_id and k.status = 'verified'
    left join public.review_replies rr on rr.review_id = r.id and rr.moderation_status = 'approved'
   where r.clinic_id = p_clinic_id and r.moderation_status = 'approved'
   order by r.created_at desc;
$$;

revoke all on function public.public_reviews(uuid) from public;
grant execute on function public.public_reviews(uuid) to anon, authenticated, service_role;
