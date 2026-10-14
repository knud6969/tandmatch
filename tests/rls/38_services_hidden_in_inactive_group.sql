-- Test 38: behandlinger i en inaktiv kategori er skjult for anon og authenticated, men synlige for admin (1.9.8).
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_anon();
select tt.ok((select count(*) from public.services where slug = 'blegning') = 1, 'anon ser behandling i aktiv kategori');

select tt.as_postgres();
update public.service_groups set is_active = false where id = (select group_id from public.services where slug = 'blegning');

select tt.as_anon();
select tt.eq((select count(*) from public.services where slug = 'blegning')::int, 0, 'anon ser ikke behandling i inaktiv kategori');
select tt.ok((select count(*) from public.services where slug = 'undersoegelse') = 1, 'andre kategorier er upåvirkede');

select tt.as_user(tt.id('uA1'));
select tt.eq((select count(*) from public.services where slug = 'blegning')::int, 0, 'klinik ser ikke behandling i inaktiv kategori');

-- En aktiv behandling, hvis egen is_active er slået fra, er stadig skjult i en aktiv kategori
select tt.as_postgres();
update public.service_groups set is_active = true where id = (select group_id from public.services where slug = 'blegning');
update public.services set is_active = false where slug = 'blegning';
select tt.as_anon();
select tt.eq((select count(*) from public.services where slug = 'blegning')::int, 0, 'inaktiv behandling er skjult');

rollback;
