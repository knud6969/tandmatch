-- Test 32 (importeret/overtaget klinik, import_source sat; selvoprettede klinikker dækkes af test 36): når en klinikejer slettes (også uden om API'et), rydder triggeren clinics_after_owner_removed() selv alle rækker
-- klinikken har lagt ind (H2/M4), og grunddata bevares. Taget-over-importeret klinik (H1): usynlig, til den er verificeret.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- A1: udfyld alt, hvad en klinik selv kan lægge ind
select tt.as_postgres();
update public.clinics
   set description = 'Vores klinik', email = 'a1@test.invalid', website = 'https://a1.test.invalid', phone = '+45 11 22 33 44',
       logo_path = 'clinics/x/logo.jpg', logo_updated_at = now(),
       trustpilot_url = 'https://dk.trustpilot.com/review/a1.test', trustpilot_score = 4.5, trustpilot_review_count = 10,
       trustpilot_entered_by = 'clinic'
 where id = tt.cid('A1');
insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at) values (tt.cid('A1'), tt.slot(5, 8), tt.slot(5, 9));
insert into public.clinic_dentists (id, clinic_id, full_name) values (tt.id('dA1'), tt.cid('A1'), 'Tandlæge A1');
insert into public.portfolio_items (clinic_id, dentist_id, image_path, patient_consent_confirmed_at, consent_text_version)
values (tt.cid('A1'), tt.id('dA1'), 'clinics/a1/portfolio/1.jpg', now(), 'v1');
-- A2: Trustpilot indtastet af admin bevares
update public.clinics set trustpilot_url = 'https://dk.trustpilot.com/review/a2.test', trustpilot_score = 3.8, trustpilot_review_count = 5,
                          trustpilot_entered_by = 'admin' where id = tt.cid('A2');

select tt.eq((select trustpilot_entered_by from public.clinics where id = tt.cid('A1')), 'clinic', 'forudsætning: A1''s Trustpilot er indtastet af klinikken');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 2, 'forudsætning: priser');

delete from auth.users where id in (tt.id('uA1'), tt.id('uA2'));

-- A1: klinikkens egne data er væk
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'imported', 'A1 er imported');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 0, 'priser slettet');
select tt.eq((select count(*) from public.clinic_service_groups where clinic_id = tt.cid('A1'))::int, 0, 'valgte kategorier slettet');
select tt.eq((select count(*) from public.clinic_time_blocks where clinic_id = tt.cid('A1'))::int, 0, 'blokeringer slettet');
select tt.eq((select count(*) from public.clinic_dentists where clinic_id = tt.cid('A1'))::int, 0, 'tandlæger slettet');
select tt.eq((select count(*) from public.portfolio_items where clinic_id = tt.cid('A1'))::int, 0, 'portefølje slettet');
select tt.eq((select description from public.clinics where id = tt.cid('A1')), null::text, 'beskrivelse ryddet');
select tt.eq((select email from public.clinics where id = tt.cid('A1')), null::text, 'e-mail ryddet');
select tt.eq((select website from public.clinics where id = tt.cid('A1')), null::text, 'website ryddet');
select tt.eq((select logo_path from public.clinics where id = tt.cid('A1')), null::text, 'logo ryddet');
select tt.eq((select logo_updated_at from public.clinics where id = tt.cid('A1')), null::timestamptz, 'logo-version ryddet');
select tt.eq((select trustpilot_url from public.clinics where id = tt.cid('A1')), null::text, 'klinikindtastet Trustpilot ryddet');
select tt.eq((select trustpilot_entered_by from public.clinics where id = tt.cid('A1')), null::text, 'trustpilot_entered_by ryddet');
-- Grunddata bevaret
select tt.eq((select name from public.clinics where id = tt.cid('A1')), 'Testklinik A1', 'navn bevaret');
select tt.eq((select phone from public.clinics where id = tt.cid('A1')), '+45 11 22 33 44', 'telefon bevaret');
select tt.eq((select cvr from public.clinics where id = tt.cid('A1')), '10000006', 'CVR bevaret');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A1'))::int, 14, 'åbningstider bevaret');
-- A2: admin-Trustpilot bevaret, resten ryddet
select tt.eq((select trustpilot_score from public.clinics where id = tt.cid('A2')), 3.8::numeric, 'admin-indtastet Trustpilot bevaret');
select tt.eq((select trustpilot_entered_by from public.clinics where id = tt.cid('A2')), 'admin', 'entered_by = admin bevaret');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A2'))::int, 0, 'A2: priser slettet');

-- Offentligt: en importeret klinik uden ejer vises som basis (ingen priser)
select tt.as_anon();
select tt.eq((select status::text from public.public_clinics(null, array[tt.cid('A1')])), 'imported', 'A1 vises som imported');

-- H1: ny ejer overtager A1 via CVR, men klinikken er registered og dermed usynlig
select tt.as_postgres();
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uNew'), 'ny@test.invalid', false, jsonb_build_object('role', 'clinic', 'cvr', '10000006', 'clinic_name', 'Ny', 'address', 'Vej 1',
                                                              'postal_code', '2100', 'city', 'København Ø'));
-- [PROTOTYPE] Signup auto-verificerer; scenariet gælder uverificerede ejere, så klinikken sættes tilbage til registered.
select public.admin_set_clinic_status(tt.cid('A1'), 'registered');
select tt.eq((select status::text from public.clinics where id = tt.cid('A1')), 'registered', 'overtaget klinik er registered');
select tt.as_anon();
select tt.eq((select count(*) from public.public_clinics(null, array[tt.cid('A1')]))::int, 0, 'H1: overtaget klinik er usynlig i oversigten');
select tt.eq((select count(*) from public.public_clinic_profile(tt.cid('A1')))::int, 0, 'H1: overtaget klinik har ingen offentlig profil');
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A1'), 'verified');
select tt.as_anon();
select tt.eq((select count(*) from public.public_clinics(null, array[tt.cid('A1')]))::int, 1, 'verificeret klinik er synlig igen');

rollback;
