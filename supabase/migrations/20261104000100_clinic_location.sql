-- Placering ud fra adressen (clinics 4.3 "Placering ud fra adressen", besluttet 2026-10-26).
-- (1) clinics_guard(): som i 20261016000100, men postnummerets midtpunkt sættes nu også, når klinikken ændrer adressen
--     (før kun ved nyt postnummer). Så står en gammel præcis placering aldrig ved en ny adresse, hvis opslaget fejler.
-- (2) set_clinic_location(p_lat, p_lng): serveren gemmer den fundne placering med klinikkens egen session (ejer,
--     permanent konto). lat/lng kommer ikke i kolonne-grants (platform 5.1 regel 12). Punktet skal ligge i Danmark og
--     højst 25 km fra postnummerets midtpunkt (MAX_POSTAL_CENTER_DISTANCE_KM i geocodingService.ts).

create or replace function public.clinics_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_system boolean := (select auth.uid()) is null or public.is_admin();
  v_flag boolean := coalesce(current_setting('tm.clinic_status', true), '') = 'on';
  v_trust_changed boolean;
  v_clinic_trust boolean;
  v_snap public.clinic_import_snapshots%rowtype;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'removed' then
      raise exception 'CLINIC_REMOVED' using errcode = 'P0001';
    end if;
    -- owner_since følger owner_id og kan ikke sættes udefra.
    if new.owner_id is distinct from old.owner_id then
      new.owner_since := case when new.owner_id is null then null else now() end;
    else
      new.owner_since := old.owner_since;
    end if;
    if new.id is distinct from old.id then
      raise exception 'Feltet kan ikke ændres' using errcode = '42501';
    end if;
    if (new.status is distinct from old.status or new.verified_at is distinct from old.verified_at) and not v_flag then
      raise exception 'Status ændres kun af admin' using errcode = '42501';
    end if;
    if not v_system and (
         new.owner_id is distinct from old.owner_id
      or new.cvr is distinct from old.cvr
      or new.import_source is distinct from old.import_source
    ) then
      raise exception 'Feltet kan ikke ændres' using errcode = '42501';
    end if;
    -- Ejeren fjernes (konto slettet).
    if new.owner_id is null and old.owner_id is not null then
      if new.import_source is null then
        -- Selvoprettet klinik: endelig 'removed'. Kun navn, adresse, postnummer, by og koordinater bevares.
        v_clinic_trust := old.trustpilot_entered_by = 'clinic'; -- admin-indtastet Trustpilot bevares som for importerede
        new.status := 'removed';
        new.cvr := null;
        new.verified_at := null;
        new.phone := null;
        new.description := null;
        new.email := null;
        new.website := null;
        new.logo_path := null;
        new.logo_updated_at := null;
        if v_clinic_trust then
          new.trustpilot_url := null;
          new.trustpilot_score := null;
          new.trustpilot_review_count := null;
          new.trustpilot_updated_at := null;
          new.trustpilot_entered_by := null;
        end if;
        new.updated_at := now();
        return new;
      end if;
      -- Importeret klinik: en uverificeret ejers ændringer af grunddata rulles tilbage (security, 1.9.7).
      if old.status <> 'verified' then
        select * into v_snap from public.clinic_import_snapshots s where s.clinic_id = old.id;
        if found then
          new.name := v_snap.name;
          new.address := v_snap.address;
          new.postal_code := v_snap.postal_code;
          new.city := v_snap.city;
          new.phone := v_snap.phone;
          new.lat := v_snap.lat;
          new.lng := v_snap.lng;
        end if;
      end if;
      if new.status <> 'imported' then
        new.status := 'imported';
        new.verified_at := null;
      end if;
      new.updated_at := now();
      return new;
    end if;
    -- Ny adresse eller nyt postnummer: placeringen bliver postnummerets midtpunkt. Serveren slår bagefter adressen op og
    -- gemmer et fund med set_clinic_location() (clinics 4.3).
    if (new.postal_code is distinct from old.postal_code or new.address is distinct from old.address) and not v_system then
      select pc.lat, pc.lng into new.lat, new.lng from public.postal_codes pc where pc.postal_code = new.postal_code;
      if not found then
        new.lat := null;
        new.lng := null;
      end if;
    end if;
    v_trust_changed := (new.trustpilot_url, new.trustpilot_score, new.trustpilot_review_count)
                       is distinct from (old.trustpilot_url, old.trustpilot_score, old.trustpilot_review_count);
    if v_trust_changed and not v_system then
      new.trustpilot_entered_by := 'clinic';
    elsif not v_system then
      new.trustpilot_entered_by := old.trustpilot_entered_by;
    end if;
    if new.trustpilot_score is distinct from old.trustpilot_score then
      new.trustpilot_updated_at := now();
    elsif not v_system then
      new.trustpilot_updated_at := old.trustpilot_updated_at;
    end if;
    new.updated_at := now();
  else
    new.owner_since := case when new.owner_id is null then null else now() end;
    if new.trustpilot_score is not null and new.trustpilot_updated_at is null then
      new.trustpilot_updated_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.clinics_guard() from public, anon, authenticated;

-- Sætter placeringen på den kaldendes egen klinik. Ingen klinik-id som parameter; ejerskabet afgøres af auth.uid().
-- Kun punkter i Danmark (inkl. Bornholm og Ertholmene) og højst 25 km fra postnummerets midtpunkt. clinics_guard() kører
-- som ved enhver opdatering (fx afvises en 'removed' klinik med CLINIC_REMOVED).
create or replace function public.set_clinic_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_clinic_id uuid;
  v_center_lat double precision;
  v_center_lng double precision;
begin
  if not public.is_permanent_user() then
    raise exception 'Kræver en konto' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null
     or p_lat = 'NaN'::double precision or p_lng = 'NaN'::double precision
     or p_lat not between 54.4 and 57.9 or p_lng not between 7.9 and 15.3 then
    raise exception 'Placeringen skal ligge i Danmark' using errcode = '22023';
  end if;
  select c.id, pc.lat, pc.lng into v_clinic_id, v_center_lat, v_center_lng
  from public.clinics c
  left join public.postal_codes pc on pc.postal_code = c.postal_code
  where c.owner_id = (select auth.uid());
  if v_clinic_id is null then
    raise exception 'Ingen klinik' using errcode = 'P0002';
  end if;
  -- Funktionen kan kaldes direkte med klinikkens egen session (PostgREST). Punktet skal derfor ligge højst 25 km fra
  -- klinikkens postnummers midtpunkt, så en klinik ikke kan flytte sig vilkårligt i afstandssorteringen væk fra sin
  -- adresse (security 2026-10-26). Ukendt postnummer: ingen placering.
  if v_center_lat is null or v_center_lng is null
     or public.haversine_km(v_center_lat, v_center_lng, p_lat, p_lng) > 25 then
    raise exception 'Placeringen passer ikke til postnummeret' using errcode = '22023';
  end if;
  update public.clinics set lat = p_lat, lng = p_lng where id = v_clinic_id;
end;
$$;
revoke all on function public.set_clinic_location(double precision, double precision) from public, anon;
grant execute on function public.set_clinic_location(double precision, double precision) to authenticated;
