-- Del 5: triggere på auth.users (architecture 4.3 profiles, 7.7, 10.2).
-- Signup-metadata (raw_user_meta_data): role ('patient' | 'clinic'), first_name (patient), og for klinik:
-- cvr, clinic_name, address, postal_code, city, phone. Anonyme får altid rollen patient. admin kan aldrig vælges.

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_anonymous boolean := coalesce(new.is_anonymous, false);
  v_role public.user_role;
  v_first_name text := nullif(btrim(v_meta ->> 'first_name'), '');
  v_cvr text := nullif(btrim(v_meta ->> 'cvr'), '');
  v_postal text := nullif(btrim(v_meta ->> 'postal_code'), '');
  v_existing public.clinics%rowtype;
  v_lat double precision;
  v_lng double precision;
begin
  if v_anonymous then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'patient' then
    v_role := 'patient';
  elsif v_meta ->> 'role' = 'clinic' then
    v_role := 'clinic';
  else
    raise exception 'Ugyldig rolle ved oprettelse' using errcode = '22023';
  end if;

  insert into public.profiles (id, role, is_anonymous) values (new.id, v_role, v_anonymous);

  if v_role = 'patient' then
    insert into public.patients (id, first_name)
    values (new.id, case when v_anonymous then null else v_first_name end);
    return new;
  end if;

  -- Klinik: findes en importeret klinik uden ejer med samme CVR, knyttes kontoen til den [PROTOTYPE].
  if v_cvr is null or v_cvr !~ '^[0-9]{8}$' then
    raise exception 'Ugyldigt CVR-nummer' using errcode = '22023';
  end if;

  select * into v_existing from public.clinics where cvr = v_cvr for update;
  if found then
    if v_existing.owner_id is not null then
      raise exception 'CLINIC_EXISTS' using errcode = 'P0001';
    end if;
    perform set_config('tm.clinic_status', 'on', true);
    update public.clinics
       set owner_id = new.id, status = 'registered', verified_at = null
     where id = v_existing.id;
    perform set_config('tm.clinic_status', '', true);
  else
    select pc.lat, pc.lng into v_lat, v_lng from public.postal_codes pc where pc.postal_code = v_postal;
    insert into public.clinics (owner_id, status, cvr, name, address, postal_code, city, phone, lat, lng)
    values (
      new.id, 'registered', v_cvr,
      btrim(v_meta ->> 'clinic_name'), btrim(v_meta ->> 'address'), v_postal,
      btrim(v_meta ->> 'city'), nullif(btrim(v_meta ->> 'phone'), ''), v_lat, v_lng
    );
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Spejler auth.users.is_anonymous (konvertering anonym -> konto).
create function public.handle_auth_user_anonymity_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set is_anonymous = coalesce(new.is_anonymous, false) where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_anonymity_changed
  after update of is_anonymous on auth.users
  for each row
  when (new.is_anonymous is distinct from old.is_anonymous)
  execute function public.handle_auth_user_anonymity_changed();

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_auth_user_anonymity_changed() from public, anon, authenticated;
