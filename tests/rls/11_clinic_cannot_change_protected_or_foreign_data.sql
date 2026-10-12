-- Test 11: Klinik kan ikke ændre egen status, owner_id eller cvr, og kan ikke redigere en anden kliniks prisliste,
-- åbningstider, tandlæger eller portefølje.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('uX'));

-- Egne beskyttede felter
select tt.denied(format('update public.clinics set status = %L where id = %L', 'imported', tt.cid('X')), 'klinik kan ikke ændre egen status');
select tt.denied(format('update public.clinics set verified_at = null where id = %L', tt.cid('X')), 'klinik kan ikke ændre verified_at');
select tt.denied(format('update public.clinics set owner_id = %L where id = %L', tt.id('uY'), tt.cid('X')), 'klinik kan ikke ændre owner_id');
select tt.denied(format('update public.clinics set owner_id = null where id = %L', tt.cid('X')), 'klinik kan ikke fjerne sin owner_id');
select tt.denied(format('update public.clinics set cvr = %L where id = %L', '99999999', tt.cid('X')), 'klinik kan ikke ændre cvr');
select tt.denied(format('insert into public.clinics (status, name, address, postal_code, city, owner_id) values (%L, %L, %L, %L, %L, %L)',
                        'verified', 'Falsk klinik', 'Vej 1', '2100', 'København Ø', tt.id('uX')), 'klinik kan ikke oprette klinikker');
select tt.denied(format('delete from public.clinics where id = %L', tt.cid('X')), 'klinik kan ikke slette klinikken');
select tt.allowed(format('update public.clinics set name = %L, description = %L where id = %L', 'Nyt navn', 'Ny beskrivelse', tt.cid('X')), 'klinik kan redigere navn og beskrivelse');
select tt.affects(format('update public.clinics set name = %L where id = %L', 'Overtaget', tt.cid('Y')), 0, 'klinik kan ikke redigere en anden klinik');

-- Andens prisliste
select tt.affects(format('update public.clinic_prices set price_min = 1, price_max = 2 where clinic_id = %L', tt.cid('Y')), 0, 'kan ikke opdatere Y''s priser');
select tt.affects(format('delete from public.clinic_prices where clinic_id = %L', tt.cid('Y')), 0, 'kan ikke slette Y''s priser');
select tt.denied(format('insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) values (%L, %L, 1, 2, 30)', tt.cid('Y'), tt.svc('fyldning')),
                 'kan ikke indsætte pris hos Y');
-- Andens åbningstider
select tt.affects(format('update public.clinic_opening_hours set opens_at = %L where clinic_id = %L', '00:00', tt.cid('Y')), 0, 'kan ikke opdatere Y''s åbningstider');
select tt.affects(format('delete from public.clinic_opening_hours where clinic_id = %L', tt.cid('Y')), 0, 'kan ikke slette Y''s åbningstider');
select tt.denied(format('insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at) values (%L, 1, %L, %L)', tt.cid('Y'), '03:00', '04:00'),
                 'kan ikke indsætte åbningstid hos Y');
-- Andens blokeringer
select tt.denied(format('insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at) values (%L, now() + interval %L, now() + interval %L)', tt.cid('Y'), '1 day', '2 days'),
                 'kan ikke blokere tid hos Y');
-- Andens tandlæger
select tt.affects(format('update public.clinic_dentists set full_name = %L where clinic_id = %L', 'Hacket', tt.cid('Y')), 0, 'kan ikke opdatere Y''s tandlæger');
select tt.affects(format('delete from public.clinic_dentists where clinic_id = %L', tt.cid('Y')), 0, 'kan ikke slette Y''s tandlæger');
select tt.denied(format('insert into public.clinic_dentists (clinic_id, full_name) values (%L, %L)', tt.cid('Y'), 'Falsk Tandlæge'), 'kan ikke indsætte tandlæge hos Y');
-- Andens portefølje (X's egen portefølje findes; Y's har ingen rækker, så brug R''s og I''s)
select tt.affects(format('update public.portfolio_items set caption = %L where clinic_id = %L', 'Hacket', tt.cid('R')), 0, 'kan ikke opdatere en anden kliniks portefølje');
select tt.affects(format('delete from public.portfolio_items where clinic_id = %L', tt.cid('R')), 0, 'kan ikke slette en anden kliniks portefølje');
select tt.denied(format('insert into public.portfolio_items (clinic_id, dentist_id, image_path, patient_consent_confirmed_at, consent_text_version) values (%L, %L, %L, now(), %L)',
                        tt.cid('X'), tt.id('dX'), 'x/evil.jpg', 'v1'), 'klinik kan ikke indsætte portefølje selv (kun service role)');
select tt.denied(format('delete from public.portfolio_items where clinic_id = %L', tt.cid('X')), 'klinik kan ikke slette portefølje selv');

-- Egne rækker kan redigeres
select tt.affects(format('update public.clinic_prices set price_min = 600 where clinic_id = %L', tt.cid('X')), 2, 'kan opdatere egne priser');
select tt.affects(format('update public.clinic_dentists set title = %L where clinic_id = %L', 'Overtandlæge', tt.cid('X')), 1, 'kan opdatere egne tandlæger');
select tt.affects(format('update public.portfolio_items set caption = %L where clinic_id = %L', 'Ny tekst', tt.cid('X')), 1, 'kan opdatere egen portefølje-tekst');

-- Anonym session (JWT is_anonymous = true) kan ikke redigere, selv som ejer
select tt.as_user(tt.id('uX'), true);
select tt.denied(format('insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) values (%L, %L, 1, 2, 30)', tt.cid('X'), tt.svc('fyldning')),
                 'ikke-permanent session kan ikke redigere prisliste');

rollback;
