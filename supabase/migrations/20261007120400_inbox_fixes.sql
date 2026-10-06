-- Rettelser til indbakken (reviewer runde 5).
-- 1. Tilbagetrukket svar lader modtagerstatus blive 'responded'. Tandlægen kan ikke svare igen
--    (én række pr. tandlæge og forespørgsel, jf. unique-constraint), så 'new' ville vise en forkert "Ny".
--    Tilbagetrækningen fremgår af responses.status = 'withdrawn'.
-- 2. dentist_inbox().image_count tæller kun billeder med aktivt samtykke (samme regel som dentist_request_images()).

create or replace function public.responses_sync_recipient_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Kun ved oprettelse af et svar. Tilbagetrækning ændrer ikke modtagerstatus.
  if tg_op = 'INSERT' and new.status = 'sent' then
    update public.request_recipients rr
       set status = 'responded'
     where rr.request_id = new.request_id and rr.dentist_id = new.dentist_id;
  end if;
  return null;
end;
$fn$;

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
    (
      select count(*)
      from public.request_images i
      join public.consents c on c.id = i.consent_id
      where i.request_id = r.id
        and c.withdrawn_at is null
    )
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
