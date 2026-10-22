-- Test 33: kolonne-grants på tandlæger (M1), website-check (L1) og lofter i databasen (L4).
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('uA1'));

-- M1: klinikken kan ikke sætte photo_path/photo_updated_at, hverken ved insert eller update
select tt.denied(format('insert into public.clinic_dentists (clinic_id, full_name, photo_path) values (%L, %L, %L)', tt.cid('A1'), 'Ny', 'clinics/x/y.jpg'),
                 'M1: photo_path kan ikke indsættes', '42501');
insert into public.clinic_dentists (clinic_id, full_name, title, bio, sort_order) values (tt.cid('A1'), 'Tandlæge Ny', 'Tandlæge', 'Bio', 1);
create temp table dd as select id from public.clinic_dentists where full_name = 'Tandlæge Ny';
grant select on dd to public;
select tt.denied(format('update public.clinic_dentists set photo_path = %L where id = %L', 'clinics/x/y.jpg', (select id from dd)), 'M1: photo_path kan ikke opdateres', '42501');
select tt.denied(format('update public.clinic_dentists set photo_updated_at = now() where id = %L', (select id from dd)), 'M1: photo_updated_at kan ikke opdateres', '42501');
select tt.denied(format('update public.clinic_dentists set clinic_id = %L where id = %L', tt.cid('A2'), (select id from dd)), 'M1: clinic_id kan ikke flyttes', '42501');
update public.clinic_dentists set full_name = 'Tandlæge Omdøbt', bio = null where id = (select id from dd);
select tt.eq((select full_name from public.clinic_dentists where id = (select id from dd)), 'Tandlæge Omdøbt', 'redigerbare felter kan opdateres');
-- Samme for andre filfelter
select tt.denied(format('update public.clinics set logo_path = %L where id = %L', 'x', tt.cid('A1')), 'logo_path kan ikke opdateres', '42501');
select tt.denied(format('update public.clinics set logo_updated_at = now() where id = %L', tt.cid('A1')), 'logo_updated_at kan ikke opdateres', '42501');
select tt.denied(format('update public.portfolio_items set image_path = %L', 'x'), 'image_path kan ikke opdateres', '42501');
select tt.denied(format('insert into public.portfolio_items (clinic_id, dentist_id, image_path, patient_consent_confirmed_at, consent_text_version) values (%L, %L, %L, now(), %L)',
                        tt.cid('A1'), (select id from dd), 'x', 'v1'), 'portefølje kan ikke indsættes af klinikken', '42501');

-- L1: website skal være http(s)
select tt.denied(format('update public.clinics set website = %L where id = %L', 'javascript:alert(1)', tt.cid('A1')), 'L1: javascript-link afvises', 'clinics_website_http');
select tt.denied(format('update public.clinics set website = %L where id = %L', 'a1.dk', tt.cid('A1')), 'L1: link uden protokol afvises', 'clinics_website_http');
update public.clinics set website = 'https://a1.test.invalid' where id = tt.cid('A1');
update public.clinics set website = null where id = tt.cid('A1');

-- L4: lofter (direkte kald med brugerens JWT)
select tt.as_postgres();
insert into public.clinic_dentists (clinic_id, full_name) select tt.cid('A1'), 'T' || g from generate_series(1, 29) g; -- 1 + 29 = 30
select tt.as_user(tt.id('uA1'));
select tt.denied(format('insert into public.clinic_dentists (clinic_id, full_name) values (%L, %L)', tt.cid('A1'), 'T31'), 'L4: 31. tandlæge afvises', 'DENTIST_LIMIT');

select tt.as_postgres();
insert into public.clinic_dentists (id, clinic_id, full_name) values (tt.id('dpf'), tt.cid('A2'), 'PF');
insert into public.portfolio_items (clinic_id, dentist_id, image_path, patient_consent_confirmed_at, consent_text_version)
select tt.cid('A2'), tt.id('dpf'), 'clinics/a2/p' || g, now(), 'v1' from generate_series(1, 60) g;
select tt.denied(format('insert into public.portfolio_items (clinic_id, dentist_id, image_path, patient_consent_confirmed_at, consent_text_version) values (%L, %L, %L, now(), %L)',
                        tt.cid('A2'), tt.id('dpf'), 'clinics/a2/p61', 'v1'), 'L4: 61. porteføljebillede afvises', 'PORTFOLIO_LIMIT');

select tt.as_user(tt.id('uA3'));
-- A3 har 14 vinduer; 28 mere giver 42
insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at)
select tt.cid('A3'), d, (t || ':00')::time, (t || ':30')::time from generate_series(1, 7) d, unnest(array['01','02','03','04']) t;
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A3'))::int, 42, 'forudsætning: 42 vinduer');
select tt.denied(format('insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at) values (%L, 1, %L, %L)', tt.cid('A3'), '05:00', '06:00'),
                 'L4: 43. åbningsvindue afvises', 'OPENING_HOURS_LIMIT');

select tt.as_user(tt.id('uA4'));
insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at)
select tt.cid('A4'), now() + make_interval(days => g), now() + make_interval(days => g, hours => 1) from generate_series(1, 200) g;
select tt.denied(format('insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at) values (%L, now() + interval ''300 days'', now() + interval ''301 days'')', tt.cid('A4')),
                 'L4: 201. blokering afvises', 'TIME_BLOCK_LIMIT');

-- Prisliste: højst 100 rækker i replace_clinic_prices
select tt.as_user(tt.id('uA5'));
select tt.denied(format('select public.replace_clinic_prices(%L::jsonb)', (select jsonb_agg(jsonb_build_object('serviceId', tt.svc('undersoegelse'), 'priceMin', 1, 'priceMax', 2, 'durationMin', 30)) from generate_series(1, 101))),
                 'L4: over 100 prisrækker afvises', 'INVALID_INPUT');

rollback;
