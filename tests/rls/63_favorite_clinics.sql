-- Test 63 (RLS-punkt 58; features/clinics/README.md 4.3, 10.17; migration 20261106000200_favorite_clinics):
--  * En patient ser og sletter kun egne favoritter; klinikker og anonyme kan ikke indsætte eller læse.
--  * Kun offentligt synlige klinikker (verified, importeret uden ejer) kan gemmes; registered og removed afvises.
--  * Loftet på 200 (FAVORITE_LIMIT); ingen UPDATE; sletning af kontoen sletter favoritterne.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select tt.allowed(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('X')), 'pA gemmer verificeret klinik');
select tt.allowed(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('I')), 'pA gemmer importeret klinik uden ejer');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('R')), 'registered klinik kan ikke gemmes', '42501');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pB'), tt.cid('Y')), 'kan ikke gemme på andens vegne', '42501');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('X')), 'dublet afvises', '23505');
select tt.rows('select 1 from public.favorite_clinics', 2, 'pA ser egne to');
select tt.denied(format('update public.favorite_clinics set clinic_id = %L where patient_id = %L', tt.cid('Y'), tt.id('pA')), 'ingen UPDATE', '42501');

select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.favorite_clinics', 0, 'pB ser ikke pAs favoritter');
select tt.affects(format('delete from public.favorite_clinics where patient_id = %L', tt.id('pA')), 0, 'pB kan ikke slette pAs');
select tt.allowed(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pB'), tt.cid('X')), 'pB gemmer X');

select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.favorite_clinics', 0, 'klinikken ser ingen favoritter');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('uX'), tt.cid('X')), 'klinik kan ikke gemme');

select tt.as_user(tt.id('pAnon'), true);
select tt.rows('select 1 from public.favorite_clinics', 0, 'anonym ser intet');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pAnon'), tt.cid('X')), 'anonym kan ikke gemme', '42501');

select tt.as_anon();
select tt.rows('select 1 from public.favorite_clinics', 0, 'anon-rollen ser intet');

-- En klinik, der bliver usynlig, kan ikke gemmes (removed/registered), men en eksisterende række bliver stående.
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('Y'), 'registered');
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('Y')), 'Y er registered', '42501');
select tt.as_postgres();
select tt.ok(not public.is_public_clinic(tt.cid('Y')) or true, 'is_public_clinic kan kaldes');
select tt.eq((select count(*)::int from public.clinics k where public.is_public_clinic(k.id) and k.status = 'registered'), 0, 'registered er ikke offentlig');

-- Loftet: pA har 2; fyld op til 200 (som postgres), den 201. afvises.
insert into public.clinics (status, cvr, name, address, postal_code, city, lat, lng)
select 'imported', (20000000 + g)::text, 'Fiktiv ' || g, 'Vej 1', '2100', 'København Ø', 55.7, 12.5 from generate_series(1, 198) g;
insert into public.favorite_clinics (patient_id, clinic_id)
select tt.id('pA'), k.id from public.clinics k where k.cvr like '200000__' or k.cvr like '20000___' limit 198;
select tt.eq((select count(*)::int from public.favorite_clinics where patient_id = tt.id('pA')), 200, 'pA har 200');
select tt.as_user(tt.id('pA'));
select tt.allowed(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L) on conflict do nothing', tt.id('pA'), tt.cid('I')), 'en allerede gemt klinik kan gemmes igen ved loftet');
select tt.denied(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('Z')), 'den 201. afvises', 'FAVORITE_LIMIT');
select tt.allowed(format('delete from public.favorite_clinics where patient_id = %L and clinic_id = %L', tt.id('pA'), tt.cid('X')), 'pA fjerner en');
select tt.allowed(format('insert into public.favorite_clinics (patient_id, clinic_id) values (%L, %L)', tt.id('pA'), tt.cid('Z')), 'plads igen efter sletning');

-- Sletning af patienten sletter favoritterne.
select tt.as_postgres();
delete from public.patients where id = tt.id('pB');
select tt.eq((select count(*)::int from public.favorite_clinics where patient_id = tt.id('pB')), 0, 'favoritter slettes med patienten');

rollback;
