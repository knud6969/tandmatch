-- Tests for patientens valg af svar og responseCount (byggetrin 4). Kører efter alle tidligere suiter.
-- Patient A = ...0101, patient B = ...0102. Tandlæger X = ...0111, Y = ...0112, Z = ...0113 (alle verificerede).

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

create function pg_temp.expect_error(p_sql text, p_label text, p_state text) returns void
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
  raise notice 'OK (blokeret, %): % -> %', st, p_label, sqlerrm;
end $$;

create function pg_temp.expect_count(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n is distinct from p_expected then
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

-- ---------- Fixtures (som ejer) ----------
select pg_temp.as_db_owner();
-- 1301: A's sendte forespørgsel (X, Y, Z modtagere). 1302: B's sendte forespørgsel (X). 1303: A's sendte forespørgsel (X).
-- 1304: A's forespørgsel der er udløbet.
insert into public.requests (id, patient_id, category, questions_version, postal_code, summary_text, summary_approved_at) values
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', 'Opsummering', now()),
  ('00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000000102', 'blegning', 'v0-prototype', '2000', 'Opsummering', now()),
  ('00000000-0000-4000-8000-000000001303', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', 'Opsummering', now()),
  ('00000000-0000-4000-8000-000000001304', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', 'Opsummering', now());
select set_config('tm.transition', 'on', false);
update public.requests set status = 'sent', sent_at = now() - interval '1 day', expires_at = now() + interval '14 days'
 where id in ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000001303');
update public.requests set status = 'sent', sent_at = now() - interval '20 days', expires_at = now() - interval '1 day'
 where id = '00000000-0000-4000-8000-000000001304';
select set_config('tm.transition', '', false);
insert into public.request_recipients (request_id, dentist_id, distance_km) values
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000111', 1),
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000112', 2),
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000113', 3),
  ('00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000000111', 1),
  ('00000000-0000-4000-8000-000000001303', '00000000-0000-4000-8000-000000000111', 1),
  ('00000000-0000-4000-8000-000000001304', '00000000-0000-4000-8000-000000000111', 1);
-- Svar oprettes som ejer (samme trigger som ved RLS-indsættelse). Ekstra svar: X's svar på 1303 trækkes tilbage senere.
insert into public.responses (id, request_id, dentist_id, assessment, price_min, price_max) values
  ('00000000-0000-4000-8000-000000001401', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000111', 'X', 1000, 2000),
  ('00000000-0000-4000-8000-000000001402', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000112', 'Y', 1100, 2100),
  ('00000000-0000-4000-8000-000000001403', '00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000000113', 'Z', 1200, 2200),
  ('00000000-0000-4000-8000-000000001404', '00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000000111', 'X til B', 1000, 2000),
  ('00000000-0000-4000-8000-000000001405', '00000000-0000-4000-8000-000000001303', '00000000-0000-4000-8000-000000000111', 'X til 1303', 1000, 2000),
  ('00000000-0000-4000-8000-000000001406', '00000000-0000-4000-8000-000000001304', '00000000-0000-4000-8000-000000000111', 'X udløbet', 1000, 2000);

-- ---------- 1. responseCount: patienten ser det faktiske antal, andre ser kun deres eget ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001301' and status = 'sent'$$, 3, 'responseCount: A ser alle tre sendte svar på 1301');
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001301'$$, 0, 'B ser ikke svar på As forespørgsel');
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001301'$$, 1, 'tandlæge X ser kun sit eget svar (ingen andres antal)');

-- ---------- 2. Tandlæge kan ikke vælge ----------
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001401', 'chosen')$$, 'tandlæge kan ikke vælge sit eget svar', 'P0002');
select pg_temp.expect_error($$update public.responses set patient_decision = 'chosen' where id = '00000000-0000-4000-8000-000000001401'$$, 'tandlæge kan ikke skrive patient_decision direkte', '42501');

-- ---------- 3. Patient kan ikke vælge andres svar ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001404', 'chosen')$$, 'A kan ikke vælge svar på Bs forespørgsel', 'P0002');
select pg_temp.expect_updated($$update public.responses set patient_decision = 'declined' where id = '00000000-0000-4000-8000-000000001402'$$, 0, 'patient kan ikke skrive patient_decision direkte (ingen UPDATE-policy)');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001401', 'maybe')$$, 'ugyldigt valg afvises', '22023');

-- ---------- 4. Afvisning og ét valg pr. svar ----------
select pg_temp.expect_count($$select ((public.decide_response('00000000-0000-4000-8000-000000001401', 'declined')).patient_decision = 'declined')::int$$, 1, 'A afviser Xs svar');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001401', 'chosen')$$, 'patient kan ikke ændre valg efter første beslutning', 'P0001');

-- ---------- 5. Valg af én tandlæge lukker forespørgslen og blokerer andre svar ----------
select pg_temp.expect_count($$select ((public.decide_response('00000000-0000-4000-8000-000000001402', 'chosen')).patient_decision = 'chosen')::int$$, 1, 'A vælger Ys svar');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001403', 'chosen')$$, 'efter chosen kan et andet svar ikke vælges', 'P0001');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000001301' and status = 'closed'$$, 1, 'valg lukker forespørgslen');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001301' and patient_decision = 'chosen'$$, 1, 'præcis ét valgt svar på forespørgslen');
select set_config('tm.system', 'on', false);
select pg_temp.expect_error($$update public.responses set patient_decision = 'chosen' where id = '00000000-0000-4000-8000-000000001403'$$, 'backstop: to chosen svar på samme forespørgsel afvises', '23505');
select set_config('tm.system', '', false);

-- ---------- 6. Tilbagetrukne og udløbne forespørgsler ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_updated($$update public.responses set status = 'withdrawn' where id = '00000000-0000-4000-8000-000000001405'$$, 1, 'X trækker svar på 1303 tilbage');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001405', 'chosen')$$, 'trukket svar kan ikke vælges', 'P0001');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001303' and status = 'sent'$$, 0, 'responseCount tæller ikke trukne svar');
select pg_temp.expect_count($$select count(*) from public.responses where request_id = '00000000-0000-4000-8000-000000001303'$$, 1, 'patient ser trukne svar i listen');
select pg_temp.expect_error($$select public.decide_response('00000000-0000-4000-8000-000000001406', 'chosen')$$, 'udløbet forespørgsel kan ikke besvares med valg', 'P0001');

select pg_temp.as_db_owner();
select 'ALLE RESPONSE-DECISION-TESTS PASSEDE' as resultat;
