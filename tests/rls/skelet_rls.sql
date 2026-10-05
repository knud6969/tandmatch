-- RLS- og triggertests for trin 1 (skelet). Kører mod en ren Postgres med 00_supabase_auth_stub.sql.
-- Alle personer er fiktive. Kør:  psql -v ON_ERROR_STOP=1 -f 00_supabase_auth_stub.sql -f <migrationer> -f skelet_rls.sql
-- Fejler scriptet, er mindst én sikkerhedsregel brudt.

create function pg_temp.as_user(p_uid uuid, p_anon boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_anon_role() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

create function pg_temp.as_db_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

create function pg_temp.expect_error(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  if sqlerrm like 'FEJL:%' then raise; end if;
  raise notice 'OK (blokeret): % -> %', p_label, sqlerrm;
end $$;

create function pg_temp.expect_count(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n <> p_expected then
    raise exception 'FEJL: % forventede %, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (%)', p_label, n;
end $$;

create function pg_temp.expect_updated(p_sql text, p_expected int, p_label text) returns void
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FEJL: % forventede % opdaterede rækker, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (% rækker)', p_label, n;
end $$;

-- ---------- Fiktive brugere (ingen rigtige personer) ----------
select pg_temp.as_db_owner();
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000001', 'patient-a@example.test', '{"role":"patient","first_name":"Test A"}', false),
  ('00000000-0000-4000-8000-000000000002', 'patient-b@example.test', '{"role":"patient","first_name":"Test B"}', false),
  ('00000000-0000-4000-8000-000000000003', null, '{}', true),
  ('00000000-0000-4000-8000-000000000004', null, '{}', true),
  ('00000000-0000-4000-8000-000000000011', 'tand-x@example.test', '{"role":"dentist","full_name":"Test Tandlæge X","authorization_id":"TST-0001"}', false),
  ('00000000-0000-4000-8000-000000000012', 'tand-y@example.test', '{"role":"dentist","full_name":"Test Tandlæge Y","authorization_id":"TST-0002"}', false),
  ('00000000-0000-4000-8000-000000000013', 'tand-z@example.test', '{"role":"dentist","full_name":"Test Tandlæge Z","authorization_id":"TST-0003"}', false),
  ('00000000-0000-4000-8000-000000000099', 'admin@example.test', '{"role":"patient","first_name":"Test Admin"}', false);

-- Admin sættes manuelt i databasen (aldrig via signup).
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000099';

-- ---------- 1. Triggere ved signup ----------
select pg_temp.expect_count($$select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000001' and role = 'patient' and is_anonymous = false$$, 1, 'Patient-profil oprettet');
select pg_temp.expect_count($$select count(*) from public.patients where id = '00000000-0000-4000-8000-000000000001' and first_name = 'Test A'$$, 1, 'Patient-række med fornavn');
select pg_temp.expect_count($$select count(*) from public.patients where id = '00000000-0000-4000-8000-000000000003' and first_name is null$$, 1, 'Anonym patient uden fornavn');
select pg_temp.expect_count($$select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000003' and role = 'patient' and is_anonymous = true$$, 1, 'Anonym får rolle patient');
select pg_temp.expect_count($$select count(*) from public.dentists where id = '00000000-0000-4000-8000-000000000011' and is_verified = false and clinic_id is null$$, 1, 'Ny tandlæge er ikke verificeret');

select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x@example.test', '{"role":"admin"}')$$, 'signup med rolle admin afvises');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x2@example.test', '{}')$$, 'signup uden rolle afvises');
select pg_temp.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x3@example.test', '{"role":"dentist","full_name":"Test Tandlæge Q","authorization_id":"ikke gyldigt id!"}')$$, 'tandlæge med ugyldigt autorisations-ID afvises');

-- Anonym som bliver til konto (konvertering) følger med: samme id, is_anonymous spejles.
update auth.users set is_anonymous = false, email = 'anon-konverteret@example.test' where id = '00000000-0000-4000-8000-000000000004';
select pg_temp.expect_count($$select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000004' and is_anonymous = false$$, 1, 'Konvertering spejles til profiles');

-- ---------- 2. Profiles og patients: egne rækker ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select pg_temp.expect_count($$select count(*) from public.profiles$$, 1, 'Patient A ser kun egen profil');
select pg_temp.expect_count($$select count(*) from public.patients$$, 1, 'Patient A ser kun egen patient-række');
select pg_temp.expect_updated($$update public.profiles set role = 'dentist' where id = '00000000-0000-4000-8000-000000000001'$$, 0, 'Patient kan ikke ændre egen rolle');
select pg_temp.expect_updated($$update public.patients set first_name = 'Hacket' where id = '00000000-0000-4000-8000-000000000002'$$, 0, 'Patient kan ikke ændre anden patients navn');
select pg_temp.expect_updated($$update public.patients set first_name = 'Test A2' where id = '00000000-0000-4000-8000-000000000001'$$, 1, 'Patient kan opdatere eget fornavn');
select pg_temp.expect_error($$update public.patients set first_name = repeat('x', 60) where id = '00000000-0000-4000-8000-000000000001'$$, 'for langt fornavn afvises');
select pg_temp.expect_count($$select count(*) from public.dentists where id = '00000000-0000-4000-8000-000000000011'$$, 0, 'Patient ser ikke ikke-verificeret tandlæge');
select pg_temp.expect_error($$insert into public.clinics (name, address, postal_code, city, created_by) values ('Test Klinik Patient', 'Testvej 1', '2000', 'Testby', '00000000-0000-4000-8000-000000000001')$$, 'patient kan ikke oprette klinik');
select pg_temp.expect_error($$insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at) values ('00000000-0000-4000-8000-000000000002', 'v0-prototype', 'v0-prototype', now())$$, 'patient kan ikke skrive vilkårs-accept for andre');

-- ---------- 3. Vilkårs-accept og samtykker ----------
select pg_temp.expect_updated($$insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at) values ('00000000-0000-4000-8000-000000000001', 'v0-prototype', 'v0-prototype', now()) on conflict do nothing$$, 1, 'Patient kan skrive egen vilkårs-accept');
select pg_temp.expect_updated($$update public.terms_acceptances set terms_version = 'hacket' where user_id = '00000000-0000-4000-8000-000000000001'$$, 0, 'Vilkårs-accept kan ikke ændres');
select pg_temp.expect_count($$select count(*) from public.terms_acceptances where user_id = '00000000-0000-4000-8000-000000000002'$$, 0, 'Patient ser ikke anden patients vilkårs-accept');
select pg_temp.expect_error($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000001', 'health_data_sharing', 'hds@v0', true)$$, 'granted_while_anonymous skal matche session (permanent = false)');
select pg_temp.expect_updated($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000001', 'health_data_sharing', 'hds@v0', false)$$, 1, 'Permanent patient kan give health_data_sharing');
select pg_temp.expect_updated($$update public.consents set withdrawn_at = now() where patient_id = '00000000-0000-4000-8000-000000000001'$$, 0, 'Samtykke kan ikke ændres direkte (kun via RPC senere)');

select pg_temp.as_user('00000000-0000-4000-8000-000000000002');
select pg_temp.expect_count($$select count(*) from public.consents$$, 0, 'Patient B ser ikke patient A samtykker');
select pg_temp.expect_count($$select count(*) from public.terms_acceptances$$, 0, 'Patient B ser ikke patient A vilkårs-accept');

-- ---------- 4. Anonym session ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_error($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000003', 'health_data_sharing', 'hds@v0', true)$$, 'anonym kan ikke give health_data_sharing');
select pg_temp.expect_error($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000003', 'ai_processing', 'ai@v0', false)$$, 'anonym: granted_while_anonymous=false afvises');
select pg_temp.expect_updated($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000003', 'ai_processing', 'ai@v0', true)$$, 1, 'anonym kan give ai_processing');
select pg_temp.expect_error($$insert into public.dentists (id, full_name, authorization_id) values ('00000000-0000-4000-8000-000000000003', 'Test Anon', 'TST-9999')$$, 'anonym kan ikke oprette tandlæge-række');
select pg_temp.expect_error($$insert into public.clinics (name, address, postal_code, city, created_by) values ('Test Klinik Anon', 'Testvej 2', '2000', 'Testby', '00000000-0000-4000-8000-000000000003')$$, 'anonym kan ikke oprette klinik');
select pg_temp.expect_count($$select count(*) from public.consents$$, 1, 'anonym ser kun egne samtykker');
select pg_temp.expect_count($$select count(*) from public.profiles$$, 1, 'anonym ser kun egen profil');
select pg_temp.expect_count($$select count(*) from public.patients$$, 1, 'anonym ser kun egen patient-række');

select pg_temp.as_db_owner();
update public.profiles set last_active_at = '2000-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-000000000003';
select pg_temp.as_user('00000000-0000-4000-8000-000000000003', true);
select public.touch_last_active();
select pg_temp.expect_count($$select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000003' and last_active_at > '2000-01-01T00:00:00Z'$$, 1, 'touch_last_active opdaterer anonym');
select pg_temp.expect_updated($$update public.profiles set last_active_at = '2000-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-000000000003'$$, 0, 'anonym kan ikke sætte last_active_at direkte');

select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select public.touch_last_active();
select pg_temp.as_db_owner();
update public.profiles set last_active_at = '2000-01-01T00:00:00Z' where id = '00000000-0000-4000-8000-000000000001';
select pg_temp.as_user('00000000-0000-4000-8000-000000000001');
select public.touch_last_active();
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000001' and last_active_at = '2000-01-01T00:00:00Z'$$, 1, 'touch_last_active rører ikke permanente konti');

-- has_active_consent: seneste række afgør
select pg_temp.as_user('00000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_count($$select count(*) from (select public.has_active_consent('ai_processing') as v) s where v$$, 1, 'has_active_consent(ai_processing) er sand');
select pg_temp.expect_count($$select count(*) from (select public.has_active_consent('image_upload') as v) s where v$$, 0, 'has_active_consent(image_upload) er falsk uden samtykke');
select pg_temp.as_db_owner();
update public.consents set withdrawn_at = now() where patient_id = '00000000-0000-4000-8000-000000000003';
select pg_temp.as_user('00000000-0000-4000-8000-000000000003', true);
select pg_temp.expect_count($$select count(*) from (select public.has_active_consent('ai_processing') as v) s where v$$, 0, 'has_active_consent er falsk efter tilbagetrækning');

-- ---------- 5. Tandlæger: verifikation, klinik og guards ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000011');
select pg_temp.expect_error($$update public.dentists set is_verified = true where id = '00000000-0000-4000-8000-000000000011'$$, 'tandlæge kan ikke selv verificere sig');
select pg_temp.expect_error($$update public.dentists set authorization_id = 'FALSK-1' where id = '00000000-0000-4000-8000-000000000011'$$, 'tandlæge kan ikke ændre autorisations-ID');
select pg_temp.expect_updated($$update public.dentists set id = id, bio = 'Test-bio' where id = '00000000-0000-4000-8000-000000000012'$$, 0, 'tandlæge kan ikke ændre anden tandlæges profil');
select pg_temp.expect_count($$select count(*) from public.dentists$$, 1, 'tandlæge X ser kun egen (uverificeret) række');
select pg_temp.expect_error($$insert into public.clinics (name, address, postal_code, city, created_by) values ('Test Klinik X', 'Testvej 3', '2000', 'Testby', '00000000-0000-4000-8000-000000000012')$$, 'klinik kan kun oprettes med egen created_by');
select pg_temp.expect_updated($$insert into public.clinics (name, address, postal_code, city, created_by) values ('Test Klinik X', 'Testvej 3', '2000', 'Testby', '00000000-0000-4000-8000-000000000011')$$, 1, 'tandlæge X opretter egen klinik');
select pg_temp.expect_updated($$update public.dentists set clinic_id = (select id from public.clinics where name = 'Test Klinik X') where id = '00000000-0000-4000-8000-000000000011'$$, 1, 'tandlæge X knytter sig til egen klinik');
select pg_temp.expect_updated($$update public.clinics set name = 'Test Klinik X (opdateret)' where name like 'Test Klinik X%'$$, 1, 'klinik-medlem kan opdatere egen klinik');
select pg_temp.expect_error($$update public.clinics set created_by = '00000000-0000-4000-8000-000000000012' where name like 'Test Klinik X%'$$, 'created_by kan ikke ændres');
select pg_temp.expect_error($$insert into public.clinics (name, address, postal_code, city, created_by, trustpilot_url) values ('Test Klinik TP', 'Testvej 4', '2000', 'Testby', '00000000-0000-4000-8000-000000000011', 'https://evil.example.com/x')$$, 'Trustpilot-URL må kun være trustpilot.com');
select pg_temp.expect_updated($$insert into public.clinics (name, address, postal_code, city, created_by, trustpilot_url, trustpilot_score) values ('Test Klinik TP', 'Testvej 4', '2000', 'Testby', '00000000-0000-4000-8000-000000000011', 'https://dk.trustpilot.com/review/test-klinik', 4.5)$$, 1, 'gyldig Trustpilot-URL og score');

select pg_temp.as_user('00000000-0000-4000-8000-000000000012');
select pg_temp.expect_error($$update public.dentists set clinic_id = (select id from public.clinics where name = 'Test Klinik X (opdateret)') where id = '00000000-0000-4000-8000-000000000012'$$, 'tandlæge Y kan ikke flytte sig ind i X klinik');
select pg_temp.expect_updated($$update public.clinics set name = 'Hacket' where name like 'Test Klinik X%'$$, 0, 'tandlæge Y kan ikke redigere X klinik');

-- Admin verificerer Y. X forbliver uverificeret.
select pg_temp.as_user('00000000-0000-4000-8000-000000000099');
select pg_temp.expect_updated($$update public.dentists set is_verified = true where id = '00000000-0000-4000-8000-000000000012'$$, 1, 'admin kan verificere tandlæge');
select pg_temp.expect_error($$insert into public.profiles (id, role) values ('00000000-0000-4000-8000-000000000099', 'admin')$$, 'ingen kan indsætte profiles direkte');

-- Anonym rolle (ingen session): kun offentlige data
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.dentists$$, 1, 'besøgende ser kun verificerede tandlæger');
select pg_temp.expect_count($$select count(*) from public.profiles$$, 0, 'besøgende ser ingen profiler');
select pg_temp.expect_count($$select count(*) from public.terms_acceptances$$, 0, 'besøgende ser ingen vilkårs-accepter');
select pg_temp.expect_count($$select count(*) from public.clinics$$, 2, 'besøgende ser klinikker');
select pg_temp.expect_count($$select count(*) from public.postal_codes$$, 0, 'postal_codes er tom og uskrivbar for besøgende');
select pg_temp.expect_error($$insert into public.postal_codes values ('2000', 'Testby', 0, 0)$$, 'besøgende kan ikke skrive postal_codes');

select pg_temp.as_db_owner();
select 'ALLE TRIN 1 RLS-TESTS PASSEDE' as resultat;
