-- Admin uden direkte læseadgang til persondata (security-runde 2026-11-05, M1 og H1; features/admin/README.md 3 og 5.3).
--  * is_admin() fjernes fra SELECT-policyerne på reviews, review_replies, profiles og terms_acceptances. Admin ser dér kun
--    sine egne rækker (reviews og review_replies: ingen, fordi admin hverken er patient eller klinikejer).
--  * admin_reviews() og admin_review_replies(): moderationens læsevej. Aldrig patient_id, booking_id eller patientnavn.
--  * admin_clinic_owners(): ejerens login-e-mail til /admin/klinikker (H1), kun for de klinikker, listen spørger om.
--  * admin_change_clinic_status(): en begrundelse er obligatorisk ved registered -> verified (H1). Samme signatur.
-- clinics beholder admins læse-policy (virksomhedsdata; clinics_guard() bruger is_admin()).

drop policy reviews_select_own_or_admin on public.reviews;
create policy reviews_select_own on public.reviews
  for select to authenticated using (patient_id = (select auth.uid()));

drop policy review_replies_select_own_clinic_or_admin on public.review_replies;
create policy review_replies_select_own_clinic on public.review_replies
  for select to authenticated using (public.review_is_for_my_clinic(review_id));

drop policy profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy terms_acceptances_select_own_or_admin on public.terms_acceptances;
create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

-- Anmeldelser til moderationen. Filtrer på status og/eller id (null = alle). Ældste først, højst 200.
create function public.admin_reviews(p_status public.moderation_status default null, p_id uuid default null)
returns table (
  id uuid, created_at timestamptz, clinic_id uuid, clinic_name text,
  moderation_status public.moderation_status, rejection_reason text, moderated_at timestamptz,
  stars smallint, text text, price_accuracy public.price_accuracy, actual_price integer,
  lacked_transparency boolean, transparency_comment text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select r.id, r.created_at, r.clinic_id, k.name::text,
           r.moderation_status, r.rejection_reason, r.moderated_at,
           r.stars, r.text, r.price_accuracy, r.actual_price,
           r.lacked_transparency, r.transparency_comment
      from public.reviews r
      join public.clinics k on k.id = r.clinic_id
     where (p_status is null or r.moderation_status = p_status)
       and (p_id is null or r.id = p_id)
     order by r.created_at, r.id
     limit 200;
end;
$$;

-- Klinikkernes svar til moderationen, med teksten på den anmeldelse, svaret hører til (uden patient- og bookingreference).
create function public.admin_review_replies(p_status public.moderation_status default null, p_id uuid default null)
returns table (
  id uuid, created_at timestamptz, clinic_id uuid, clinic_name text,
  moderation_status public.moderation_status, rejection_reason text, moderated_at timestamptz,
  review_id uuid, text text, review_text text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select p.id, p.created_at, p.clinic_id, k.name::text,
           p.moderation_status, p.rejection_reason, p.moderated_at,
           p.review_id, p.text, r.text
      from public.review_replies p
      join public.reviews r on r.id = p.review_id
      join public.clinics k on k.id = p.clinic_id
     where (p_status is null or p.moderation_status = p_status)
       and (p_id is null or p.id = p_id)
     order by p.created_at, p.id
     limit 200;
end;
$$;

-- Ejerens login-e-mail for de ønskede klinikker (højst 200). Kun klinikker med en ejer.
create function public.admin_clinic_owners(p_clinic_ids uuid[])
returns table (clinic_id uuid, owner_email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_clinic_ids is null or coalesce(array_length(p_clinic_ids, 1), 0) > 200 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  return query
    select k.id, u.email::text
      from public.clinics k
      join auth.users u on u.id = k.owner_id
     where k.id = any(p_clinic_ids);
end;
$$;

-- Som 20261107000200, men "Verificér" (registered -> verified) kræver en begrundelse. Overgangen tjekkes først.
create or replace function public.admin_change_clinic_status(
  p_clinic_id uuid, p_status public.clinic_status, p_reason text default null
)
returns public.clinic_status
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text;
  v_from public.clinic_status;
begin
  perform public.assert_admin();
  v_reason := public.admin_clean_reason(p_reason);
  select k.status into v_from from public.clinics k where k.id = p_clinic_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not ((v_from = 'registered' and p_status = 'verified') or (v_from = 'verified' and p_status = 'registered')) then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = 'P0001';
  end if;
  if p_status = 'verified' and v_reason is null then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  perform public.admin_set_clinic_status(p_clinic_id, p_status);
  insert into public.admin_actions (admin_id, action, target_id, from_value, to_value, reason)
  values ((select auth.uid()), 'clinic_status', p_clinic_id, v_from::text, p_status::text, v_reason);
  return p_status;
end;
$$;

revoke all on function public.admin_reviews(public.moderation_status, uuid) from public, anon;
revoke all on function public.admin_review_replies(public.moderation_status, uuid) from public, anon;
revoke all on function public.admin_clinic_owners(uuid[]) from public, anon;
revoke all on function public.admin_change_clinic_status(uuid, public.clinic_status, text) from public, anon;
grant execute on function public.admin_reviews(public.moderation_status, uuid) to authenticated;
grant execute on function public.admin_review_replies(public.moderation_status, uuid) to authenticated;
grant execute on function public.admin_clinic_owners(uuid[]) to authenticated;
grant execute on function public.admin_change_clinic_status(uuid, public.clinic_status, text) to authenticated;
