-- Test 56: [PROTOTYPE] auto-verificering (docs/beslutninger.md 12.2). En klinik, der opretter sig, bliver straks verified
-- med verified_at og kan modtage et lead; en overtaget importeret klinik får samme status; imported uden ejer forbliver
-- imported og kan ikke modtage leads. Slås funktionen fra, bliver nye klinikker registered igen.
begin;
\ir _helpers.sql
\ir _fixtures.sql

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uNy'), 'ny-klinik@test.invalid', false,
   jsonb_build_object('role', 'clinic', 'cvr', '10000099', 'clinic_name', 'Ny testklinik', 'address', 'Testvej 3',
                      'postal_code', '2100', 'city', 'København Ø', 'phone', '+45 11 22 33 55'));

select tt.eq((select status::text from public.clinics where owner_id = tt.id('uNy')), 'verified', 'ny klinik er verified efter signup');
select tt.ok((select verified_at is not null from public.clinics where owner_id = tt.id('uNy')), 'ny klinik har verified_at');
select tt.eq((select status::text from public.clinics where id = tt.cid('I')), 'imported', 'imported uden ejer forbliver imported');
select tt.eq((select status::text from public.clinics where id = tt.cid('R')), 'registered', 'fixture R er sat tilbage til registered');

-- Den nye klinik kan modtage et lead; imported kan ikke.
create temp table new_clinic as select id from public.clinics where owner_id = tt.id('uNy');
grant select on new_clinic to public;
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('I')), 'imported kan ikke modtage leads', 'CLINIC_NOT_AVAILABLE');
select public.send_leads(tt.id('S'), array[(select id from new_clinic)]::uuid[]);
select tt.as_postgres();
select tt.ok(exists (select 1 from public.leads l join public.clinics c on c.id = l.clinic_id where c.owner_id = tt.id('uNy')), 'lead sendt til den nye klinik');

-- Overtagelse af en importeret klinik via CVR giver også verified.
delete from auth.users where id = tt.id('uA1');
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uOver'), 'overtager2@test.invalid', false,
   jsonb_build_object('role', 'clinic', 'cvr', (select cvr from tt.clinic_names where name = 'A1'),
                      'clinic_name', 'Overtaget', 'address', 'Testvej 9', 'postal_code', '2100', 'city', 'København Ø'));
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'verified', 'overtaget importeret klinik er verified');

rollback;
