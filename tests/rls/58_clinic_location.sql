-- Test 58: placering ud fra adressen (clinics 4.3, migration 20261104000100).
-- Ny adresse eller nyt postnummer giver postnummerets midtpunkt; set_clinic_location() sætter kun den kaldendes egen
-- kliniks placering, kun i Danmark og kun for en permanent konto. lat/lng er stadig ikke i kolonne-grants.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Ejeren af X gemmer en præcis placering.
select tt.as_user(tt.id('uX'));
select public.set_clinic_location(55.7101, 12.5802);
select tt.as_postgres();
select tt.eq((select lat from public.clinics where id = tt.cid('X')), 55.7101::double precision, 'lat gemt på egen klinik');
select tt.eq((select lng from public.clinics where id = tt.cid('X')), 12.5802::double precision, 'lng gemt på egen klinik');
select tt.ok((select lat from public.clinics where id = tt.cid('Y')) is distinct from 55.7101, 'en anden klinik er uændret');

-- Ny adresse (samme postnummer): placeringen bliver postnummerets midtpunkt.
select tt.as_user(tt.id('uX'));
update public.clinics set address = 'Nyvej 5' where id = tt.cid('X');
select tt.as_postgres();
select tt.eq((select lat from public.clinics where id = tt.cid('X')), (select lat from public.postal_codes where postal_code = '2100'), 'ny adresse: midtpunktets lat');
select tt.eq((select lng from public.clinics where id = tt.cid('X')), (select lng from public.postal_codes where postal_code = '2100'), 'ny adresse: midtpunktets lng');

-- Andre felter (fx telefon) rører ikke en gemt placering.
select tt.as_user(tt.id('uX'));
select public.set_clinic_location(55.7101, 12.5802);
update public.clinics set phone = '+45 11 22 33 66' where id = tt.cid('X');
select tt.as_postgres();
select tt.eq((select lat from public.clinics where id = tt.cid('X')), 55.7101::double precision, 'telefonændring bevarer placeringen');

-- Nyt postnummer: midtpunktet for det nye postnummer.
select tt.as_user(tt.id('uX'));
update public.clinics set postal_code = '8000', city = 'Aarhus C' where id = tt.cid('X');
select tt.as_postgres();
select tt.eq((select lat from public.clinics where id = tt.cid('X')), (select lat from public.postal_codes where postal_code = '8000'), 'nyt postnummer: midtpunktets lat');

-- Uden for Danmark, ugyldige tal og null afvises.
select tt.as_user(tt.id('uX'));
select tt.denied('select public.set_clinic_location(52.52, 13.405)', 'Berlin afvises', '22023');
select tt.denied('select public.set_clinic_location(55.7, 20.0)', 'lng øst for Bornholm afvises', '22023');
select tt.denied('select public.set_clinic_location(''NaN''::double precision, 12.5)', 'NaN afvises', '22023');
select tt.denied('select public.set_clinic_location(null, 12.5)', 'null afvises', '22023');
-- I Danmark, men langt fra klinikkens postnummer (Aarhus for en klinik i 8000 er ok; Skagen er ikke).
select tt.denied('select public.set_clinic_location(57.7209, 10.5839)', 'punkt langt fra postnummeret afvises', '22023');
select public.set_clinic_location(56.1500, 10.2100);
select tt.as_postgres();
select tt.eq((select lat from public.clinics where id = tt.cid('X')), 56.15::double precision, 'punkt nær postnummeret gemt');
select tt.as_user(tt.id('uX'));

-- Kolonnerne kan stadig ikke opdateres direkte.
select tt.denied(format('update public.clinics set lat = 55.0 where id = %L', tt.cid('X')), 'lat kan ikke opdateres direkte', '42501');

-- En patient (ingen klinik), en anonym bruger og anon kan ikke.
select tt.as_user(tt.id('pA'));
select tt.denied('select public.set_clinic_location(55.7, 12.5)', 'patient uden klinik afvises', 'P0002');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied('select public.set_clinic_location(55.7, 12.5)', 'anonym bruger afvises', '42501');
select tt.as_anon();
select tt.denied('select public.set_clinic_location(55.7, 12.5)', 'anon har ingen adgang', '42501');

rollback;
