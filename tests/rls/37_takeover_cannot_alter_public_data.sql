-- Test 37 (security 1.9.7): en uverificeret ejer, der overtager en importeret klinik via CVR, kan ikke varigt ændre,
-- hvad patienter ser. Ændrer ejeren navn, adresse, telefon og åbningstider og sletter derefter sin konto, gendannes de
-- importerede grunddata. En verificeret ejers ændringer bevares. Snapshottet kan ikke læses af klienter.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_postgres();
update public.clinics set import_source = 'cvr', phone = '+45 70 00 00 00' where id = tt.cid('I');
create table tt.orig as
  select k.name, k.address, k.postal_code, k.city, k.phone, k.lat, k.lng,
         (select count(*) from public.clinic_opening_hours h where h.clinic_id = k.id)::int as hours
    from public.clinics k where k.id = tt.cid('I');
grant select on tt.orig to public;

-- Overtagelse via CVR
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uTake'), 'take@test.invalid', false, jsonb_build_object('role', 'clinic', 'cvr', '10000013', 'clinic_name', 'x',
                                                                 'address', 'x', 'postal_code', '2100', 'city', 'x'));
select tt.eq((select status::text from public.clinics where id = tt.cid('I')), 'registered', 'overtaget klinik er registered');

-- Snapshottet kan ikke læses eller ændres af klinikken eller anon
select tt.as_user(tt.id('uTake'));
select tt.denied('select * from public.clinic_import_snapshots', 'klinik kan ikke læse snapshots');
select tt.as_anon();
select tt.denied('select * from public.clinic_import_snapshots', 'anon kan ikke læse snapshots');

-- Den uverificerede ejer ændrer grunddata og åbningstider
select tt.as_user(tt.id('uTake'));
update public.clinics set name = 'Falsk klinik', address = 'Falskvej 6', postal_code = '8000', city = 'Aarhus C',
       phone = '+45 99 99 99 99' where id = tt.cid('I');
select public.replace_opening_hours('[{"weekday":1,"opensAt":"00:00","closesAt":"23:00","isEmergency":true}]');

-- Kontoen slettes: grunddata og åbningstider er gendannet
select tt.as_postgres();
delete from auth.users where id = tt.id('uTake');
select tt.eq((select status::text from public.clinics where id = tt.cid('I')), 'imported', 'klinikken er imported igen');
select tt.ok((select (k.name, k.address, k.postal_code, k.city, k.phone, k.lat, k.lng)
                     is not distinct from (o.name, o.address, o.postal_code, o.city, o.phone, o.lat, o.lng)
                from public.clinics k, tt.orig o where k.id = tt.cid('I')), 'grunddata gendannet');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('I'))::int,
             (select hours from tt.orig), 'åbningstider gendannet');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('I') and is_emergency and opens_at = '00:00')::int,
             0, 'ejerens åbningstider er væk');
select tt.eq((select count(*) from public.clinic_import_snapshots where clinic_id = tt.cid('I'))::int, 0, 'snapshot slettet');
select tt.as_anon();
select tt.eq((select name from public.public_clinics(null, array[tt.cid('I')])), (select name from tt.orig), 'offentligt navn er det importerede');
select tt.eq((select phone from public.public_clinics(null, array[tt.cid('I')])), '+45 70 00 00 00', 'offentlig telefon er den importerede');

-- En verificeret ejers ændringer bevares
select tt.as_postgres();
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uOk'), 'ok@test.invalid', false, jsonb_build_object('role', 'clinic', 'cvr', '10000013', 'clinic_name', 'x',
                                                              'address', 'x', 'postal_code', '2100', 'city', 'x'));
select public.admin_set_clinic_status(tt.cid('I'), 'verified');
select tt.as_user(tt.id('uOk'));
update public.clinics set phone = '+45 88 88 88 88' where id = tt.cid('I');
select tt.as_postgres();
delete from auth.users where id = tt.id('uOk');
select tt.eq((select phone from public.clinics where id = tt.cid('I')), '+45 88 88 88 88', 'verificeret ejers telefon bevares');
select tt.eq((select count(*) from public.clinic_import_snapshots where clinic_id = tt.cid('I'))::int, 0, 'snapshot slettet efter verificeret ejer');

rollback;
