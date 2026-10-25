-- [PROTOTYPE] auto-verificering (beslutning 2026-10-25, docs/beslutninger.md): i en prototype, der kun skal vise, at
-- web og app spiller sammen, er der ingen verificering. En klinik, der opretter sig, bliver straks 'verified'.
-- Indstillingen er ÉN funktion: prototype_auto_verify_clinics(). Slå verificering til igen med en senere migration, der
-- erstatter funktionen med "select false" (nye klinikker bliver så 'registered' som før). handle_new_user() er ellers
-- uændret (som i 20261016000100).

create or replace function public.prototype_auto_verify_clinics()
returns boolean
language sql immutable security definer set search_path = ''
as $$ select true $$;
revoke all on function public.prototype_auto_verify_clinics() from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.clinic_status := case when public.prototype_auto_verify_clinics() then 'verified' else 'registered' end;
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
    if v_existing.owner_id is not null or v_existing.status <> 'imported' then
      raise exception 'CLINIC_EXISTS' using errcode = 'P0001';
    end if;
    -- Snapshot af de offentlige grunddata, før den uverificerede ejer kan ændre dem.
    insert into public.clinic_import_snapshots
      (clinic_id, name, address, postal_code, city, phone, lat, lng, opening_hours, taken_at)
    values (
      v_existing.id, v_existing.name, v_existing.address, v_existing.postal_code, v_existing.city, v_existing.phone,
      v_existing.lat, v_existing.lng,
      (select coalesce(jsonb_agg(jsonb_build_object(
                'weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at, 'is_emergency', h.is_emergency
              ) order by h.weekday, h.opens_at), '[]'::jsonb)
         from public.clinic_opening_hours h where h.clinic_id = v_existing.id),
      now()
    )
    on conflict (clinic_id) do update
      set name = excluded.name, address = excluded.address, postal_code = excluded.postal_code, city = excluded.city,
          phone = excluded.phone, lat = excluded.lat, lng = excluded.lng, opening_hours = excluded.opening_hours,
          taken_at = excluded.taken_at;
    perform set_config('tm.clinic_status', 'on', true);
    update public.clinics
       set owner_id = new.id, status = v_status,
           verified_at = case when v_status = 'verified' then now() else null end
     where id = v_existing.id;
    perform set_config('tm.clinic_status', '', true);
  else
    select pc.lat, pc.lng into v_lat, v_lng from public.postal_codes pc where pc.postal_code = v_postal;
    insert into public.clinics (owner_id, status, verified_at, cvr, name, address, postal_code, city, phone, lat, lng)
    values (
      new.id, v_status, case when v_status = 'verified' then now() else null end, v_cvr,
      btrim(v_meta ->> 'clinic_name'), btrim(v_meta ->> 'address'), v_postal,
      btrim(v_meta ->> 'city'), nullif(btrim(v_meta ->> 'phone'), ''), v_lat, v_lng
    );
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Backfill: eksisterende oprettede klinikker med ejer bliver verificeret. 'imported' (uden ejer) forbliver basisklinikker.
do $$
begin
  perform set_config('tm.clinic_status', 'on', true);
  update public.clinics
     set status = 'verified', verified_at = coalesce(verified_at, now())
   where status = 'registered' and owner_id is not null;
  perform set_config('tm.clinic_status', '', true);
end;
$$;
