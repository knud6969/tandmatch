-- Test 36: en selvoprettet klinik (import_source is null), hvis konto slettes, bliver 'removed' (1.9.1b, åbent spørgsmål 28):
-- rækken findes uden CVR, telefon og åbningstider, men med navn og adresse; patienternes leads, bookinger og anmeldelser består;
-- klinikken er usynlig i public_*, kan ikke få leads og kan ikke ændres; samme CVR opretter en ny registered klinik.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- tt.cid() slår klinikker op på CVR, som nulstilles ved removed: fastfrys id'erne først.
create table tt.cids as select n.name, c.id from tt.clinic_names n join public.clinics c on c.cvr = n.cvr;
grant select on tt.cids to public;
create or replace function tt.cid(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from tt.cids where name = p_name
$$;

select tt.as_postgres();
-- A1 oprettede sig selv
update public.clinics set import_source = null, description = 'Vores klinik', email = 'a1@test.invalid', website = 'https://a1.test.invalid',
       logo_path = 'clinics/x/logo.jpg', logo_updated_at = now(), trustpilot_url = 'https://dk.trustpilot.com/review/a1.test',
       trustpilot_score = 4.5, trustpilot_review_count = 10, trustpilot_entered_by = 'clinic'
 where id = tt.cid('A1');
insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at) values (tt.cid('A1'), tt.slot(5, 8), tt.slot(5, 9));
insert into public.clinic_dentists (id, clinic_id, full_name) values (tt.id('dA1'), tt.cid('A1'), 'Tandlæge A1');

-- Patientens historik hos A1: sendt lead, afholdt booking, anmeldelse (samt et lead hos A2, urørt)
select tt.mk_case('pA', 'L1');
select tt.mk_case('pA', 'L2');
select tt.mk_case('pA', 'L3');
select tt.mk_lead('L1', 'A1', 'sent');
select tt.mk_booking(tt.mk_lead('L2', 'A1', 'booked'), 'undersoegelse', now() - interval '5 days', 'completed');
select tt.mk_lead('L3', 'A2', 'sent');
select tt.as_user(tt.id('pA'));
insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy)
values (tt.booking(tt.lead('L2', 'A1')), tt.id('pA'), 4, 'Fin behandling, og prisen passede fint.', 'as_quoted');

-- Ejerens konto slettes
select tt.as_postgres();
delete from auth.users where id = tt.id('uA1');

-- Rækken findes som removed; kun navn og adresse er bevaret
select tt.eq((select count(*) from public.clinics where id = tt.cid('A1'))::int, 1, 'rækken findes stadig');
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'removed', 'status removed');
select tt.eq((select cvr from public.clinics where id = tt.cid('A1')), null::text, 'CVR nulstillet');
select tt.eq((select owner_id from public.clinics where id = tt.cid('A1')), null::uuid, 'ingen ejer');
select tt.eq((select verified_at from public.clinics where id = tt.cid('A1')), null::timestamptz, 'verified_at nulstillet');
select tt.eq((select owner_since from public.clinics where id = tt.cid('A1')), null::timestamptz, 'owner_since nulstillet');
select tt.eq((select phone from public.clinics where id = tt.cid('A1')), null::text, 'telefon ryddet');
select tt.eq((select name from public.clinics where id = tt.cid('A1')), 'Testklinik A1', 'navn bevaret');
select tt.eq((select address from public.clinics where id = tt.cid('A1')), 'Testvej 1', 'adresse bevaret');
select tt.eq((select postal_code from public.clinics where id = tt.cid('A1')), '2100', 'postnummer bevaret');
select tt.ok((select description is null and email is null and website is null and logo_path is null and logo_updated_at is null
                     and trustpilot_url is null and trustpilot_score is null and trustpilot_entered_by is null
                from public.clinics where id = tt.cid('A1')), 'klinikindtastet indhold ryddet');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A1'))::int, 0, 'åbningstider slettet');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 0, 'priser slettet');
select tt.eq((select count(*) from public.clinic_service_groups where clinic_id = tt.cid('A1'))::int, 0, 'valgte kategorier slettet');
select tt.eq((select count(*) from public.clinic_time_blocks where clinic_id = tt.cid('A1'))::int, 0, 'blokeringer slettet');
select tt.eq((select count(*) from public.clinic_dentists where clinic_id = tt.cid('A1'))::int, 0, 'tandlæger slettet');

-- Patientens historik består
select tt.eq((select status::text from public.leads where id = tt.lead('L1', 'A1')), 'declined', 'sendt lead er afvist');
select tt.eq((select decline_reason::text from public.leads where id = tt.lead('L1', 'A1')), 'clinic_left', 'clinic_left');
select tt.eq((select status::text from public.leads where id = tt.lead('L2', 'A1')), 'booked', 'lead med afholdt booking består');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('L2', 'A1')), 'completed', 'afholdt booking består');
select tt.eq((select count(*) from public.reviews where clinic_id = tt.cid('A1'))::int, 1, 'anmeldelsen består');
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.leads where clinic_id = tt.cid('A1'))::int, 2, 'patienten ser sine leads hos den slettede klinik');
select tt.eq((select count(*) from public.reviews where clinic_id = tt.cid('A1'))::int, 1, 'patienten ser sin egen anmeldelse');
select tt.eq((select status::text from public.leads where id = tt.lead('L3', 'A2')), 'sent', 'andre klinikkers leads er urørt');

-- Usynlig overalt
select tt.as_anon();
select tt.eq((select count(*) from public.public_clinics(null, array[tt.cid('A1')]))::int, 0, 'ikke i public_clinics (id)');
select tt.eq((select count(*) from public.public_clinics() where id = tt.cid('A1'))::int, 0, 'ikke i public_clinics (alle)');
select tt.eq((select count(*) from public.public_clinic_profile(tt.cid('A1')))::int, 0, 'ingen offentlig profil');
select tt.eq((select count(*) from public.public_reviews(tt.cid('A1')))::int, 0, 'ingen offentlige anmeldelser');
select tt.eq((select count(*) from public.public_clinic_review_stats_many(array[tt.cid('A1')]))::int, 0, 'ingen statistik');
select tt.eq((select count(*) from public.public_busy_intervals(array[tt.cid('A1')], now() - interval '30 days', now() + interval '30 days'))::int, 0, 'ingen optagede tider');

-- Kan ikke få leads og kan ikke ændres
select tt.as_postgres();
select tt.mk_case('pB', 'L4');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('L4'), tt.cid('A1')), 'send_leads til removed afvises', 'CLINIC_NOT_AVAILABLE');
select tt.as_postgres();
select tt.denied(format('insert into public.leads (case_id, clinic_id, status) values (%L, %L, %L)', tt.id('L4'), tt.cid('A1'), 'sent'),
                 'direkte lead til removed afvises', 'CLINIC_NOT_AVAILABLE');
select tt.denied(format('update public.clinics set name = %L where id = %L', 'Nyt navn', tt.cid('A1')), 'removed kan ikke ændres', 'CLINIC_REMOVED');
select tt.denied(format('update public.clinics set owner_id = %L where id = %L', tt.id('uA2'), tt.cid('A1')), 'removed kan ikke få en ejer', 'CLINIC_REMOVED');
select tt.denied(format('select public.admin_set_clinic_status(%L, %L)', tt.cid('A1'), 'imported'), 'admin kan ikke genoplive til imported', 'CLINIC_REMOVED');
select tt.denied(format('select public.admin_set_clinic_status(%L, %L)', tt.cid('A1'), 'verified'), 'admin kan ikke verificere removed', 'CLINIC_HAS_NO_OWNER');

-- Samme CVR opretter en ny registered klinik; den slettede er urørt
select tt.eq(public.is_cvr_claimed('10000006'), false, 'CVR er frit igen');
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uNew'), 'ny@test.invalid', false, jsonb_build_object('role', 'clinic', 'cvr', '10000006', 'clinic_name', 'Ny klinik', 'address', 'Vej 1',
                                                              'postal_code', '2100', 'city', 'København Ø'));
select tt.eq((select count(*) from public.clinics where cvr = '10000006')::int, 1, 'præcis én klinik har CVR');
select tt.ok((select id from public.clinics where cvr = '10000006') <> tt.cid('A1'), 'det er en ny række');
select tt.eq((select status::text from public.clinics where cvr = '10000006'), 'registered', 'den nye klinik er registered');
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'removed', 'den gamle er stadig removed');
select tt.eq((select count(*) from public.leads where clinic_id = (select id from public.clinics where cvr = '10000006'))::int, 0, 'den nye klinik arver ingen leads');
select tt.eq(public.is_cvr_claimed('10000006'), true, 'CVR er nu optaget');

rollback;
