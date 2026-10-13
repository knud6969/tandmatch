-- 1.9.1 del 3: offentlig synlighed (security H1) og kategori pr. behandling (architecture 5.1 regel 11, 5.3).
-- public_* viser kun verificerede klinikker (fuldt niveau) og importerede klinikker uden ejer (basisniveau).
-- En 'registered' klinik er usynlig, til den er verificeret, også en importeret klinik, der er overtaget via CVR.
-- Maskeringen af 'registered' som 'imported' udgår. Logo og tandlægeportrætter får deres version (?v=).

drop function public.public_clinic_profile(uuid, uuid[]);
drop function public.public_clinics(uuid[], uuid[]);

create function public.public_clinics(p_service_ids uuid[] default null, p_clinic_ids uuid[] default null)
returns table (
  id uuid,
  name text,
  status public.clinic_status,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  trustpilot_entered_by text,
  opening_hours jsonb,
  logo_path text,
  logo_updated_at timestamptz,
  prices jsonb,
  has_emergency_hours boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    k.id, k.name, k.status,
    k.address, k.postal_code, k.city, k.lat, k.lng, k.phone, k.website,
    k.trustpilot_url, k.trustpilot_score, k.trustpilot_review_count, k.trustpilot_updated_at, k.trustpilot_entered_by,
    (select coalesce(jsonb_agg(jsonb_build_object(
              'weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'),
              'closes_at', to_char(h.closes_at, 'HH24:MI'), 'is_emergency', h.is_emergency
            ) order by h.weekday, h.opens_at), '[]'::jsonb)
       from public.clinic_opening_hours h where h.clinic_id = k.id),
    case when k.status = 'verified' then k.logo_path end,
    case when k.status = 'verified' then k.logo_updated_at end,
    case when k.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'service_id', s.id, 'service_slug', s.slug, 'service_name', s.name,
                'group_id', g.id, 'group_slug', g.slug,
                'price_min', cp.price_min, 'price_max', cp.price_max,
                'duration_min', cp.duration_min, 'note', cp.note
              ) order by g.sort_order, s.sort_order), '[]'::jsonb)
         from public.clinic_prices cp
         join public.services s on s.id = cp.service_id and s.is_active
         join public.service_groups g on g.id = s.group_id and g.is_active
        where cp.clinic_id = k.id and p_service_ids is not null and cp.service_id = any (p_service_ids)) end,
    case when k.status = 'verified' then
      exists (select 1 from public.clinic_opening_hours h where h.clinic_id = k.id and h.is_emergency) end
  from public.clinics k
  where (k.status = 'verified' or (k.status = 'imported' and k.owner_id is null))
    and (p_clinic_ids is null or k.id = any (p_clinic_ids))
  order by k.name;
$$;

create function public.public_clinic_profile(p_clinic_id uuid, p_service_ids uuid[] default null)
returns table (
  id uuid,
  name text,
  status public.clinic_status,
  address text,
  postal_code text,
  city text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  trustpilot_url text,
  trustpilot_score numeric,
  trustpilot_review_count integer,
  trustpilot_updated_at timestamptz,
  trustpilot_entered_by text,
  opening_hours jsonb,
  logo_path text,
  logo_updated_at timestamptz,
  prices jsonb,
  has_emergency_hours boolean,
  description text,
  email text,
  all_prices jsonb,
  dentists jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    p.id, p.name, p.status, p.address, p.postal_code, p.city, p.lat, p.lng, p.phone, p.website,
    p.trustpilot_url, p.trustpilot_score, p.trustpilot_review_count, p.trustpilot_updated_at, p.trustpilot_entered_by,
    p.opening_hours, p.logo_path, p.logo_updated_at, p.prices, p.has_emergency_hours,
    case when p.status = 'verified' then k.description end,
    case when p.status = 'verified' then k.email end,
    case when p.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'service_id', s.id, 'service_slug', s.slug, 'service_name', s.name,
                'group_id', g.id, 'group_slug', g.slug,
                'price_min', cp.price_min, 'price_max', cp.price_max,
                'duration_min', cp.duration_min, 'note', cp.note
              ) order by g.sort_order, s.sort_order), '[]'::jsonb)
         from public.clinic_prices cp
         join public.services s on s.id = cp.service_id and s.is_active
         join public.service_groups g on g.id = s.group_id and g.is_active
        where cp.clinic_id = k.id) end,
    case when p.status = 'verified' then
      (select coalesce(jsonb_agg(jsonb_build_object(
                'id', d.id, 'full_name', d.full_name, 'title', d.title, 'bio', d.bio, 'photo_path', d.photo_path,
                'photo_updated_at', d.photo_updated_at,
                'portfolio', (select coalesce(jsonb_agg(jsonb_build_object(
                                        'id', pi.id, 'image_path', pi.image_path, 'caption', pi.caption,
                                        'service_name', ps.name
                                      ) order by pi.created_at), '[]'::jsonb)
                                from public.portfolio_items pi
                                left join public.services ps on ps.id = pi.service_id
                               where pi.dentist_id = d.id)
              ) order by d.sort_order, d.full_name), '[]'::jsonb)
         from public.clinic_dentists d where d.clinic_id = k.id) end
  from public.public_clinics(p_service_ids, array[p_clinic_id]) p
  join public.clinics k on k.id = p.id;
$$;

revoke all on function public.public_clinics(uuid[], uuid[]) from public;
revoke all on function public.public_clinic_profile(uuid, uuid[]) from public;
grant execute on function public.public_clinics(uuid[], uuid[]) to anon, authenticated, service_role;
grant execute on function public.public_clinic_profile(uuid, uuid[]) to anon, authenticated, service_role;
