-- RLS- og constraint-tests for trin 3 (tandlægesvar, architecture 5.5, 5.6 punkt 1, 2, 6, 8).
-- Kører på en ren database efter 00_supabase_auth_stub.sql og ALLE migrationer (inkl. 20261007120000).
-- Alle personer, klinikker og billeder er fiktive. Fejler scriptet, er mindst én sikkerhedsregel brudt.
-- Hver fejlforventning kræver en præcis SQLSTATE (ikke bare en vilkårlig fejl).

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

-- Forventer blokering med præcis SQLSTATE. Ingen blokering, eller anden SQLSTATE, fejler testen.
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
  ('00000000-0000-4000-8000-00000000f301', 'p1t3@example.test', '{"role":"patient","first_name":"Test P1"}', false),
  ('00000000-0000-4000-8000-00000000f302', 'p2t3@example.test', '{"role":"patient","first_name":"Test P2"}', false),
  ('00000000-0000-4000-8000-00000000f303', null, '{}', true),
  ('00000000-0000-4000-8000-00000000f311', 'x3@example.test', '{"role":"dentist","full_name":"Test Tandlæge X3","authorization_id":"TST-3011"}', false),
  ('00000000-0000-4000-8000-00000000f312', 'y3@example.test', '{"role":"dentist","full_name":"Test Tandlæge Y3","authorization_id":"TST-3012"}', false),
  ('00000000-0000-4000-8000-00000000f313', 'z3@example.test', '{"role":"dentist","full_name":"Test Tandlæge Z3","authorization_id":"TST-3013"}', false),
  ('00000000-0000-4000-8000-00000000f314', 'u3@example.test', '{"role":"dentist","full_name":"Test Tandlæge U3","authorization_id":"TST-3014"}', false);

insert into public.postal_codes (postal_code, city, lat, lng) values
  ('2000', 'Testby Nord', 55.676, 12.531)
on conflict (postal_code) do nothing;

insert into public.clinics (id, name, address, postal_code, city, created_by) values
  ('00000000-0000-4000-8000-00000000f321', 'Test Klinik K3-X', 'Testvej 1', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000f311'),
  ('00000000-0000-4000-8000-00000000f322', 'Test Klinik K3-Y', 'Testvej 2', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000f312'),
  ('00000000-0000-4000-8000-00000000f323', 'Test Klinik K3-Z', 'Testvej 3', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000f313'),
  ('00000000-0000-4000-8000-00000000f324', 'Test Klinik K3-U', 'Testvej 4', '2000', 'Testby Nord', '00000000-0000-4000-8000-00000000f314');

-- X, Y og Z er verificerede. U er IKKE verificeret (afventer admin).
alter table public.dentists disable trigger dentists_guard;
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-00000000f321', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000f311';
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-00000000f322', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000f312';
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-00000000f323', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000f313';
update public.dentists set is_verified = false, clinic_id = '00000000-0000-4000-8000-00000000f324', accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-00000000f314';
alter table public.dentists enable trigger dentists_guard;

-- Forespørgsler indsættes som kladde og gøres sendte med tm.transition (samme vej som send_request).
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f301', 'blegning', 'v0-prototype'),
  ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f302', 'blegning', 'v0-prototype'),
  ('00000000-0000-4000-8000-00000000f403', '00000000-0000-4000-8000-00000000f301', 'blegning', 'v0-prototype'),
  ('00000000-0000-4000-8000-00000000f404', '00000000-0000-4000-8000-00000000f303', 'blegning', 'v0-prototype');

select set_config('tm.transition', 'on', false);
-- R1: sendt, åben. Modtagere X, Y og U (U er ikke verificeret).
update public.requests set status = 'sent', sent_at = now(), expires_at = now() + interval '14 days' where id = '00000000-0000-4000-8000-00000000f401';
-- R2: sendt, åben. Modtager Z.
update public.requests set status = 'sent', sent_at = now(), expires_at = now() + interval '14 days' where id = '00000000-0000-4000-8000-00000000f402';
-- R3: sendt, men UDLØBET. Modtager X.
update public.requests set status = 'sent', sent_at = now() - interval '20 days', expires_at = now() - interval '6 days' where id = '00000000-0000-4000-8000-00000000f403';
select set_config('tm.transition', '', false);

insert into public.request_recipients (request_id, dentist_id, distance_km) values
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f311', 1.00),
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f312', 2.00),
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f314', 2.50),
  ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 3.00),
  ('00000000-0000-4000-8000-00000000f403', '00000000-0000-4000-8000-00000000f311', 1.00);

-- ---------- 1. Tandlæge X: egne svar, ingen andres ----------
select pg_temp.as_user('00000000-0000-4000-8000-00000000f311');
select pg_temp.expect_count($$select count(*) from public.responses$$, 0, 'X ser ingen svar før nogen har svaret');
select pg_temp.expect_updated($$insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max, price_note, first_available_at, offer, valid_until) values ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f311', 'Test-vurdering fra X', 1000, 2000, 'Test-prisnote', now() + interval '7 days', 'Test-tilbud X', current_date + 30)$$, 1, 'X svarer på R1 (modtager, verificeret)');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f311', 'Dobbelt', 1, 2)$$, 'X kan ikke svare to gange (unik)', '23505');

-- Y svarer også. Y er ikke synlig for X.
select pg_temp.as_user('00000000-0000-4000-8000-00000000f312');
select pg_temp.expect_updated($$insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f502', '00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f312', 'Test-vurdering fra Y', 1500, 2500)$$, 1, 'Y svarer på R1');

select pg_temp.as_user('00000000-0000-4000-8000-00000000f311');
select pg_temp.expect_count($$select count(*) from public.responses$$, 1, 'X ser kun eget svar (ikke Y''s)');
select pg_temp.expect_count($$select count(*) from public.responses where id = '00000000-0000-4000-8000-00000000f502'$$, 0, 'X ser ikke Y''s svar på id');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-00000000f401'$$, 1, 'X ser kun eget svar på samme forespørgsel');
select pg_temp.expect_updated($$update public.responses set assessment = 'Overskrevet af X' where id = '00000000-0000-4000-8000-00000000f502'$$, 0, 'X kan ikke ændre Y''s svar');
select pg_temp.expect_updated($$update public.responses set assessment = 'Opdateret af X', price_max = 2200 where id = '00000000-0000-4000-8000-00000000f501'$$, 1, 'X opdaterer eget svar mens det er åbent');
select pg_temp.expect_sqlstate($$update public.responses set patient_decision = 'chosen' where id = '00000000-0000-4000-8000-00000000f501'$$, 'X kan ikke sætte patient_decision', '42501');
select pg_temp.expect_sqlstate($$update public.responses set dentist_id = '00000000-0000-4000-8000-00000000f312' where id = '00000000-0000-4000-8000-00000000f501'$$, 'X kan ikke flytte svar til Y', '42501');
select pg_temp.expect_sqlstate($$update public.responses set request_id = '00000000-0000-4000-8000-00000000f402' where id = '00000000-0000-4000-8000-00000000f501'$$, 'X kan ikke flytte svar til anden forespørgsel', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f312', 'Svar på Y''s vegne', 1, 2)$$, 'X kan ikke oprette svar på andens vegne', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f311', 'Ikke modtager', 1, 2)$$, 'X (ikke modtager af R2) kan ikke svare', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max, status) values ('00000000-0000-4000-8000-00000000f403', '00000000-0000-4000-8000-00000000f311', 'Udløbet forespørgsel', 1, 2, 'sent')$$, 'X kan ikke svare på udløbet forespørgsel', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f404', '00000000-0000-4000-8000-00000000f311', 'Kladde', 1, 2)$$, 'X kan ikke svare på anonym kladde', '42501');

-- Withdraw: sent -> withdrawn er tilladt, derefter er rækken frossen.
select pg_temp.expect_updated($$update public.responses set status = 'withdrawn' where id = '00000000-0000-4000-8000-00000000f501'$$, 1, 'X trækker eget svar tilbage');
select pg_temp.expect_updated($$update public.responses set assessment = 'Efter tilbagetrækning' where id = '00000000-0000-4000-8000-00000000f501'$$, 0, 'trukket svar kan ikke ændres');
select pg_temp.expect_updated($$update public.responses set status = 'sent' where id = '00000000-0000-4000-8000-00000000f501'$$, 0, 'trukket svar kan ikke gøres aktivt igen');

-- ---------- 2. Tandlæge Z: modtager af R2, ikke af R1 ----------
select pg_temp.as_user('00000000-0000-4000-8000-00000000f313');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f313', 'Ikke modtager af R1', 1, 2)$$, 'Z (ikke modtager af R1) kan ikke svare', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max, status) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 'Trukket fra start', 1, 2, 'withdrawn')$$, 'svar kan ikke oprettes som withdrawn', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max, patient_decision) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 'Valgt fra start', 1, 2, 'chosen')$$, 'svar kan ikke oprettes med patient_decision', '42501');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 'Negativ pris', -1, 100)$$, 'negativ pris afvises af database', '23514');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 'Omvendt interval', 3000, 1000)$$, 'min > max afvises af database', '23514');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', '   ', 1000, 2000)$$, 'tom vurdering afvises af database', '23514');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', repeat('a', 2001), 1000, 2000)$$, 'vurdering over 2000 tegn afvises af database', '23514');
select pg_temp.expect_updated($$insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f503', '00000000-0000-4000-8000-00000000f402', '00000000-0000-4000-8000-00000000f313', 'Test-vurdering fra Z', 800, 1200)$$, 1, 'Z svarer på R2');
select pg_temp.expect_count($$select count(*) from public.responses$$, 1, 'Z ser kun eget svar');

-- ---------- 3. Tandlæge U: ikke verificeret, selv om rækken findes som modtager ----------
select pg_temp.as_user('00000000-0000-4000-8000-00000000f314');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f314', 'Uverificeret', 1, 2)$$, 'uverificeret tandlæge kan ikke svare', '42501');
select pg_temp.expect_count($$select count(*) from public.responses$$, 0, 'uverificeret tandlæge ser ingen svar');

-- ---------- 4. Patient P1 (ejer af R1 og R3) ----------
select pg_temp.as_user('00000000-0000-4000-8000-00000000f301');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-00000000f401'$$, 2, 'ejer ser alle svar på egen forespørgsel (X trukket tilbage + Y)');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-00000000f402'$$, 0, 'P1 ser ikke svar på P2''s forespørgsel');
select pg_temp.expect_count($$select count(*) from public.responses where dentist_id = '00000000-0000-4000-8000-00000000f313'$$, 0, 'P1 ser ikke Z''s svar på P2''s forespørgsel');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f301', 'Patient som tandlæge', 1, 2)$$, 'patient kan ikke oprette svar', '42501');
select pg_temp.expect_updated($$update public.responses set patient_decision = 'chosen' where request_id = '00000000-0000-4000-8000-00000000f401'$$, 0, 'patient kan ikke sætte patient_decision direkte');

-- Patient P2 (ejer af R2): ser Z's svar, ikke R1's.
select pg_temp.as_user('00000000-0000-4000-8000-00000000f302');
select pg_temp.expect_count($$select count(*) from public.responses$$, 1, 'P2 ser kun svar på egen forespørgsel');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-00000000f401'$$, 0, 'P2 ser ikke svar på P1''s forespørgsel');

-- Anonym patient A1 (kun kladde): ingen svar.
select pg_temp.as_user('00000000-0000-4000-8000-00000000f303', true);
select pg_temp.expect_count($$select count(*) from public.responses$$, 0, 'anonym ser ingen svar');
select pg_temp.expect_sqlstate($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-00000000f404', '00000000-0000-4000-8000-00000000f303', 'Anonym', 1, 2)$$, 'anonym kan ikke oprette svar', '42501');

-- ---------- 5. Patientens valg låser svaret (sættes af systemet) ----------
select pg_temp.as_db_owner();
select set_config('tm.system', 'on', false);
update public.responses set patient_decision = 'chosen' where id = '00000000-0000-4000-8000-00000000f502';
select set_config('tm.system', '', false);
select pg_temp.as_user('00000000-0000-4000-8000-00000000f312');
select pg_temp.expect_updated($$update public.responses set assessment = 'Efter patientens valg' where id = '00000000-0000-4000-8000-00000000f502'$$, 0, 'tandlæge kan ikke ændre svar efter patientens valg');

-- ---------- 6. Udløbet forespørgsel: eksisterende svar kan ikke ændres ----------
select pg_temp.as_db_owner();
insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max) values
  ('00000000-0000-4000-8000-00000000f504', '00000000-0000-4000-8000-00000000f403', '00000000-0000-4000-8000-00000000f311', 'Svar før udløb', 1000, 2000);
select pg_temp.as_user('00000000-0000-4000-8000-00000000f311');
select pg_temp.expect_updated($$update public.responses set assessment = 'Efter udløb' where id = '00000000-0000-4000-8000-00000000f504'$$, 0, 'svar på udløbet forespørgsel kan ikke ændres');
select pg_temp.as_user('00000000-0000-4000-8000-00000000f301');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-00000000f403'$$, 1, 'patient ser svar på egen udløbne forespørgsel');

-- ---------- 7. Modtagerstatus ----------
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.request_recipients where request_id = '00000000-0000-4000-8000-00000000f401' and dentist_id = '00000000-0000-4000-8000-00000000f311' and status = 'responded'$$, 1, 'modtagerstatus bliver responded efter svar');
select pg_temp.expect_count($$select count(*) from public.request_recipients where request_id = '00000000-0000-4000-8000-00000000f401' and dentist_id = '00000000-0000-4000-8000-00000000f314' and status = 'new'$$, 1, 'uverificeret modtager forbliver new');

select pg_temp.as_db_owner();
select 'ALLE TRIN 3 RLS-TESTS PASSEDE' as resultat;
