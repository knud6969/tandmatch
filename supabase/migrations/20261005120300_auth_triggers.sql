-- Trin 1 (skelet): triggers på auth.users.
-- Opretter profiles (+ patients eller dentists) ved signup og holder profiles.is_anonymous synkron.
-- Rollen kommer fra signup-metadata og accepteres kun som patient eller dentist.
-- Anonyme brugere får altid rollen patient. admin kan aldrig vælges ved signup.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_anonymous boolean := coalesce(new.is_anonymous, false);
  v_role public.user_role;
  v_first_name text := nullif(btrim(v_meta ->> 'first_name'), '');
  v_full_name text := nullif(btrim(v_meta ->> 'full_name'), '');
  v_authorization_id text := nullif(btrim(v_meta ->> 'authorization_id'), '');
begin
  if v_anonymous then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'patient' then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'dentist' then
    v_role := 'dentist';
  else
    raise exception 'Ugyldig rolle ved oprettelse' using errcode = '22023';
  end if;

  insert into public.profiles (id, role, is_anonymous)
  values (new.id, v_role, v_anonymous);

  if v_role = 'patient' then
    insert into public.patients (id, first_name)
    values (new.id, case when v_anonymous then null else v_first_name end);
  else
    -- Tandlæger oprettes som ikke-verificerede og uden klinik. Admin verificerer.
    insert into public.dentists (id, full_name, authorization_id, is_verified, is_active)
    values (new.id, coalesce(v_full_name, ''), coalesce(v_authorization_id, ''), false, true);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_auth_user_anonymity_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set is_anonymous = coalesce(new.is_anonymous, false)
   where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_anonymity_changed
  after update of is_anonymous on auth.users
  for each row
  when (new.is_anonymous is distinct from old.is_anonymous)
  execute function public.handle_auth_user_anonymity_changed();

-- Trigger-funktioner skal ikke kaldes direkte af klienter.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_auth_user_anonymity_changed() from public, anon, authenticated;
revoke all on function public.clinics_before_update() from public, anon, authenticated;
revoke all on function public.dentists_guard() from public, anon, authenticated;
