-- Byggetrin 6: samtykke-tilbagetrækning og beskedtråd (architecture 5.2, 5.3, 5.4, 7.7, 10.3, 10.7).
-- Kører på en ren database efter 00_supabase_auth_stub.sql og ALLE migrationer, til sidst i suite-rækken.
-- Alle personer er fiktive. Hver fejlforventning kræver en præcis SQLSTATE.

create function pg_temp.as_user(p_uid uuid, p_anon boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_db_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

create function pg_temp.expect_sqlstate(p_sql text, p_label text, p_state text) returns void
language plpgsql as $$
declare st text;
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  if sqlerrm like 'FEJL:%' then raise; end if;
  if st <> p_state then
    raise exception 'FEJL: % forventede SQLSTATE % men fik % (%)', p_label, p_state, st, sqlerrm;
  end if;
  raise notice 'OK (SQLSTATE %): %', st, p_label;
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
    raise exception 'FEJL: % forventede % rækker, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (% rækker)', p_label, n;
end $$;

-- ---------- Fixtures (som ejer, uden RLS) ----------
select pg_temp.as_db_owner();

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-00000000c601', 'm1c6@example.test', '{"role":"patient","first_name":"Test M1"}', false),
  ('00000000-0000-4000-8000-00000000c602', 'm3c6@example.test', '{"role":"patient","first_name":"Test M3"}', false),
  ('00000000-0000-4000-8000-00000000c611', 'd2c6@example.test', '{"role":"dentist","full_name":"Test Tandlæge M2","authorization_id":"TST-6011"}', false),
  ('00000000-0000-4000-8000-00000000c612', 'd4c6@example.test', '{"role":"dentist","full_name":"Test Tandlæge M4","authorization_id":"TST-6012"}', false);

insert into public.postal_codes (postal_code, city, lat, lng) values ('2000', 'Testby Nord', 55.676, 12.531)
  on conflict (postal_code) do nothing;

insert into public.clinics (id, name, address, postal_code, city, created_by) values
  ('00000000-0000-4000-8000-00000000c621', 'Test Klinik K6-M2', 'Testvej 61', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000c611'),
  ('00000000-0000-4000-8000-00000000c622', 'Test Klinik K6-M4', 'Testvej 62', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000c612');

alter table public.dentists disable trigger dentists_guard;
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-00000000c621', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000c611';
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-00000000c622', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000c612';
alter table public.dentists enable trigger dentists_guard;

-- R: M1's sendte forespørgsel, modtaget af M2 og M4. Rd: M1's kladde (til billeder og AI-samtale).
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-00000000c631', '00000000-0000-4000-8000-00000000c601', 'blegning', 'v0-prototype'),
  ('00000000-0000-4000-8000-00000000c632', '00000000-0000-4000-8000-00000000c601', 'blegning', 'v0-prototype');
select set_config('tm.transition', 'on', false);
update public.requests set status = 'sent', sent_at = now(), expires_at = now() + interval '14 days' where id = '00000000-0000-4000-8000-00000000c631';
select set_config('tm.transition', '', false);
insert into public.request_recipients (request_id, dentist_id, distance_km) values
  ('00000000-0000-4000-8000-00000000c631', '00000000-0000-4000-8000-00000000c611', 1.0),
  ('00000000-0000-4000-8000-00000000c631', '00000000-0000-4000-8000-00000000c612', 2.0);

-- Svar: resp1 (M2 på R) bruges til beskedtråden. resp2 (M4 på samme R) bruges til isolation.
insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max) values
  ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c631', '00000000-0000-4000-8000-00000000c611', 'Test-vurdering M2', 1000, 2000),
  ('00000000-0000-4000-8000-00000000c642', '00000000-0000-4000-8000-00000000c631', '00000000-0000-4000-8000-00000000c612', 'Test-vurdering M4', 1100, 2100);

-- Samtykker og data til tilbagetrækningstest: aktivt image_upload (to billeder på kladden Rd) og aktivt ai_processing.
insert into public.consents (id, patient_id, type, text_version, granted_while_anonymous) values
  ('00000000-0000-4000-8000-00000000c651', '00000000-0000-4000-8000-00000000c601', 'image_upload', 'image_upload@v1-ai-disclosure', false),
  ('00000000-0000-4000-8000-00000000c652', '00000000-0000-4000-8000-00000000c601', 'ai_processing', 'ai_processing@v0-prototype', false);
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values
  ('00000000-0000-4000-8000-00000000c661', '00000000-0000-4000-8000-00000000c632', '00000000-0000-4000-8000-00000000c601', '00000000-0000-4000-8000-00000000c651',
   '00000000-0000-4000-8000-00000000c632/00000000-0000-4000-8000-00000000c661.jpg', 10, 10, 10),
  ('00000000-0000-4000-8000-00000000c662', '00000000-0000-4000-8000-00000000c632', '00000000-0000-4000-8000-00000000c601', '00000000-0000-4000-8000-00000000c651',
   '00000000-0000-4000-8000-00000000c632/00000000-0000-4000-8000-00000000c662.jpg', 10, 10, 10);
insert into public.ai_conversations (id, request_id, patient_id, ai_consent_id) values
  ('00000000-0000-4000-8000-00000000c671', '00000000-0000-4000-8000-00000000c632', '00000000-0000-4000-8000-00000000c601', '00000000-0000-4000-8000-00000000c652');

-- ========== 1. Tilbagetrækning af samtykke (withdraw_consent) ==========
select pg_temp.as_user('00000000-0000-4000-8000-00000000c602');
select pg_temp.expect_sqlstate($$select * from public.withdraw_consent('00000000-0000-4000-8000-00000000c651')$$, 'patient M3 kan ikke trække M1''s samtykke tilbage', 'P0002');

select pg_temp.as_user('00000000-0000-4000-8000-00000000c601');
select pg_temp.expect_sqlstate($$select * from public.withdraw_consent('00000000-0000-4000-8000-000000000000')$$, 'tilbagetrækning af ukendt samtykke-id afvises', 'P0002');
select pg_temp.expect_count($$select count(*) from public.withdraw_consent('00000000-0000-4000-8000-00000000c651') where consent_type = 'image_upload' and array_length(deleted_image_paths, 1) = 2$$, 1, 'tilbagetrækning af image_upload sletter begge billedrækker og returnerer filstierne');
select pg_temp.expect_count($$select count(*) from public.request_images where patient_id = '00000000-0000-4000-8000-00000000c601'$$, 0, 'billedrækkerne er slettet i databasen');
select pg_temp.expect_count($$select count(*) from public.consents where id = '00000000-0000-4000-8000-00000000c651' and withdrawn_at is not null$$, 1, 'tidspunktet for tilbagetrækning er gemt');
select pg_temp.expect_sqlstate($$select * from public.withdraw_consent('00000000-0000-4000-8000-00000000c651')$$, 'samme samtykke kan ikke trækkes tilbage to gange', 'P0001');

select pg_temp.expect_count($$select count(*) from public.withdraw_consent('00000000-0000-4000-8000-00000000c652') where consent_type = 'ai_processing' and closed_conversations = 1$$, 1, 'tilbagetrækning af ai_processing lukker den aktive AI-samtale');
select pg_temp.expect_count($$select count(*) from public.ai_conversations where id = '00000000-0000-4000-8000-00000000c671' and status = 'closed'$$, 1, 'AI-samtalen er lukket i databasen');

select pg_temp.as_db_owner();

-- ========== 2. Beskedtråd: kun de to parter i ét svar ==========
select pg_temp.as_user('00000000-0000-4000-8000-00000000c601');
select pg_temp.expect_updated($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c601', 'Hej, hvornår kan jeg komme til en tid?')$$, 1, 'patient M1 skriver til M2 (deltager i resp1)');

select pg_temp.as_user('00000000-0000-4000-8000-00000000c611');
select pg_temp.expect_count($$select count(*) from public.messages where response_id = '00000000-0000-4000-8000-00000000c641'$$, 1, 'tandlæge M2 ser tråden med patienten');
select pg_temp.expect_updated($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c611', 'Jeg har tid på torsdag.')$$, 1, 'tandlæge M2 svarer i tråden');

-- Tandlæge M4 har svaret på SAMME forespørgsel, men er ikke part i resp1's tråd.
select pg_temp.as_user('00000000-0000-4000-8000-00000000c612');
select pg_temp.expect_count($$select count(*) from public.messages where response_id = '00000000-0000-4000-8000-00000000c641'$$, 0, 'tandlæge M4 (andet svar, samme forespørgsel) ser ikke M1/M2''s tråd');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c612', 'Jeg blander mig')$$, 'tandlæge M4 kan ikke skrive i M1/M2''s tråd', '42501');

-- Patient M3 er ikke part i tråden.
select pg_temp.as_user('00000000-0000-4000-8000-00000000c602');
select pg_temp.expect_count($$select count(*) from public.messages where response_id = '00000000-0000-4000-8000-00000000c641'$$, 0, 'patient M3 ser ikke M1/M2''s tråd');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c602', 'Jeg blander mig også')$$, 'patient M3 kan ikke skrive i M1/M2''s tråd', '42501');

-- Direkte skrivning af andres felter og for lang besked.
select pg_temp.as_user('00000000-0000-4000-8000-00000000c601');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c611', 'Udgiver mig for M2')$$, 'patient kan ikke sende besked som en anden', '42501');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c601', repeat('x', 2001))$$, 'besked over 2000 tegn afvises', '23514');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c601', '')$$, 'tom besked afvises', '23514');

-- Modtageren markerer som læst; afsenderen kan ikke selv markere sin besked som læst, og indhold er uforanderligt.
select pg_temp.expect_sqlstate($$update public.messages set body = 'Ændret' where response_id = '00000000-0000-4000-8000-00000000c641' and sender_id = '00000000-0000-4000-8000-00000000c601'$$, 'afsender kan ikke ændre indholdet af sin besked', '42501');
select pg_temp.expect_sqlstate($$update public.messages set read_at = now() where response_id = '00000000-0000-4000-8000-00000000c641' and sender_id = '00000000-0000-4000-8000-00000000c601' and read_at is null$$, 'afsender kan ikke markere egen besked som læst', '42501');
select pg_temp.as_user('00000000-0000-4000-8000-00000000c611');
select pg_temp.expect_updated($$update public.messages set read_at = now() where response_id = '00000000-0000-4000-8000-00000000c641' and sender_id = '00000000-0000-4000-8000-00000000c601' and read_at is null$$, 1, 'modtageren (tandlægen) markerer patientens besked som læst');

-- Anonym kan ikke skrive (is_permanent_user()).
select pg_temp.as_db_owner();
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values ('00000000-0000-4000-8000-00000000c603', null, '{}', true);
select pg_temp.as_user('00000000-0000-4000-8000-00000000c603', true);
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c603', 'Jeg er anonym')$$, 'anonym kan ikke skrive i en beskedtråd', '42501');

-- Dagligt loft: 200 beskeder fra samme afsender pr. døgn, derefter afvist.
select pg_temp.as_user('00000000-0000-4000-8000-00000000c601');
do $$
declare i int;
begin
  for i in 1..199 loop
    insert into public.messages (response_id, sender_id, body)
    values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c601', 'Besked nr. ' || i);
  end loop;
end $$;
select pg_temp.expect_count($$select count(*) from public.messages where sender_id = '00000000-0000-4000-8000-00000000c601' and created_at > now() - interval '1 day'$$, 200, 'M1 har nu sendt 200 beskeder i dag (1 tidligere + 199)');
select pg_temp.expect_sqlstate($$insert into public.messages (response_id, sender_id, body) values ('00000000-0000-4000-8000-00000000c641', '00000000-0000-4000-8000-00000000c601', 'Besked nr. 201')$$, 'dagligt loft på 200 beskeder nået, nr. 201 afvises', '42501');

select pg_temp.as_db_owner();
select 'ALLE MESSAGES-TESTS PASSEDE' as resultat;
