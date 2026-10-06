-- Tests for AI-lofter (architecture 7.6) og billed-nulstilling af godkendelse.
-- Kører efter 00_supabase_auth_stub, alle migrationer, skelet_rls.sql og trin2_rls.sql (bruger dens fixtures).

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

create function pg_temp.as_service_for(p_uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'service_role')::text, false);
  execute 'set role service_role';
end $$;

create function pg_temp.expect_forbidden(p_sql text, p_label text) returns void
language plpgsql as $$
declare st text;
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  if sqlerrm like 'FEJL:%' then raise; end if;
  if st <> '42501' then raise exception 'FEJL: % forventede 42501, fik % (%)', p_label, st, sqlerrm; end if;
  raise notice 'OK (blokeret, %): % -> %', st, p_label, sqlerrm;
end $$;

-- ---------- Fixtures ----------
select pg_temp.as_db_owner();
-- Kladder for A (permanent, id ...0101). A bruges til døgnloftet (20).
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000404', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype');
-- Kladde for B (permanent, ...0102). B har ingen tidligere udkast, så tilstanden er kendt.
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000102', 'blegning', 'v0-prototype');
-- Anonym D (...0104) med egen kladde. Bruges til det globale anonyme loft.
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000104', null, '{}', true);
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000104', 'retainer', 'v0-prototype');

-- ---------- 1. Udkast pr. forespørgsel (A, permanent: 5) ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 4, 'udkast 1 af 5 (4 tilbage)');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 3, 'udkast 2 af 5 (3 tilbage)');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 2, 'udkast 3 af 5 (2 tilbage)');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 1, 'udkast 4 af 5 (1 tilbage)');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 0, 'udkast 5 af 5 (0 tilbage)');
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 'udkast 6 afvises (SUMMARY_LIMIT)');
select pg_temp.expect_count($$select ai_generation_count::bigint from public.requests where id = '00000000-0000-4000-8000-000000000202'$$, 5, 'tæller på forespørgslen er 5');

-- ---------- 2. Døgnloft pr. patient (20) ----------
-- 202 har 5. 401-403 giver 15 mere (i alt 20). 404 skal afvises.
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000401')$$, 4, 'A udkast på 401');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000401')$$, 3, 'A udkast på 401 nr. 2');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000401')$$, 2, 'A udkast på 401 nr. 3');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000401')$$, 1, 'A udkast på 401 nr. 4');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000401')$$, 0, 'A udkast på 401 nr. 5');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000402')$$, 4, 'A udkast på 402');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000402')$$, 3, 'A udkast på 402 nr. 2');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000402')$$, 2, 'A udkast på 402 nr. 3');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000402')$$, 1, 'A udkast på 402 nr. 4');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000402')$$, 0, 'A udkast på 402 nr. 5');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000403')$$, 4, 'A udkast på 403');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000403')$$, 3, 'A udkast på 403 nr. 2');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000403')$$, 2, 'A udkast på 403 nr. 3');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000403')$$, 1, 'A udkast på 403 nr. 4');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000403')$$, 0, 'A udkast på 403 nr. 5 (20. i døgnet)');
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000404')$$, 'A udkast nr. 21 i døgnet afvises (DAILY_SUMMARY_LIMIT)');

-- ---------- 3. Ejerskab og status ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000202')$$, 'patient B kan ikke tælle udkast på A''s forespørgsel');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000201')$$, 'udkast på sendt forespørgsel afvises (NOT_DRAFT)');

-- ---------- 4. Patient kan IKKE ændre AI-tælleren eller godkendelse direkte (B, kendt tilstand: 0 udkast) ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000501')$$, 4, 'B tager ét udkast (4 tilbage)');
select pg_temp.expect_error($$update public.requests set ai_generation_count = 0 where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke nulstille ai_generation_count via UPDATE');
select pg_temp.expect_error($$update public.requests set ai_generation_count = 0 where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke nulstille tælleren (gentagelse)');
select pg_temp.expect_count($$select ai_generation_count::bigint from public.requests where id = '00000000-0000-4000-8000-000000000501'$$, 1, 'tælleren er uændret (1) efter forsøg');
select pg_temp.expect_error($$update public.requests set summary_approved_at = now() where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke sætte summary_approved_at direkte');
select pg_temp.expect_error($$update public.requests set status = 'sent', sent_at = now(), expires_at = now() where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke sætte status direkte');
select pg_temp.expect_error($$update public.requests set ai_summary = '{"x":1}'::jsonb where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke skrive ai_summary direkte');
select pg_temp.expect_error($$update public.requests set summary_ai_assisted = true where id = '00000000-0000-4000-8000-000000000501'$$, 'patient kan ikke sætte summary_ai_assisted direkte');
select pg_temp.expect_error($$insert into public.requests (patient_id, category, questions_version, ai_generation_count) values ('00000000-0000-4000-8000-000000000102', 'facings', 'v0-prototype', 5)$$, 'ny kladde med forhåndsudfyldt tæller afvises');
select pg_temp.expect_updated($$update public.requests set answers = '{"start":"hurtigst"}' where id = '00000000-0000-4000-8000-000000000501'$$, 1, 'patient kan redigere ulåste svar');
select pg_temp.expect_count($$select public.approve_summary('00000000-0000-4000-8000-000000000501', 'Test-opsummering')::text is not null::int$$, 1, 'patient godkender opsummering via funktion');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000501' and summary_approved_at is not null and ai_generation_count = 1$$, 1, 'godkendelse sat via funktion, tæller uændret');
select pg_temp.expect_error($$select public.approve_summary('00000000-0000-4000-8000-000000000202', 'Ikke min')$$, 'patient kan ikke godkende andens forespørgsel');

-- ---------- 5. Anonym: 3 udkast pr. forespørgsel, kendt start (0 udkast) ----------
select pg_temp.as_db_owner();
insert into public.ai_usage_daily (day, anonymous_calls) values ((now() at time zone 'utc')::date, 0)
  on conflict (day) do update set anonymous_calls = 0;
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000203')$$, 2, 'anonym udkast 1 af 3');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000203')$$, 1, 'anonym udkast 2 af 3');
select pg_temp.expect_count($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000203')$$, 0, 'anonym udkast 3 af 3');
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000203')$$, 'anonym udkast 4 afvises');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select anonymous_calls::bigint from public.ai_usage_daily where day = (now() at time zone 'utc')::date$$, 3, 'globalt anonymt loft er forbrugt præcis 3 gange (kun lykkede udkast)');

-- ---------- 6. Blokeret udkast forbruger IKKE det globale anonyme loft ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000203')$$, 'anonym blokeret udkast (SUMMARY_LIMIT)');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select anonymous_calls::bigint from public.ai_usage_daily where day = (now() at time zone 'utc')::date$$, 3, 'blokeret udkast tæller ikke i globalt loft');

-- ---------- 7. Globalt anonymt AI-loft i databasen (kendt start: 298) ----------
insert into public.ai_usage_daily (day, anonymous_calls) values ((now() at time zone 'utc')::date, 298)
  on conflict (day) do update set anonymous_calls = 298;
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_forbidden($$select public.try_consume_anonymous_ai_call()$$, 'anonym klient kan ikke kalde det fælles AI-loft direkte');
select pg_temp.as_service_for('00000000-0000-4000-8000-000000000103');
select pg_temp.expect_count($$select public.try_consume_anonymous_ai_call()::int$$, 1, 'service role: anonym AI-kald nr. 299 tilladt');
select pg_temp.expect_count($$select public.try_consume_anonymous_ai_call()::int$$, 1, 'service role: anonym AI-kald nr. 300 tilladt');
select pg_temp.expect_count($$select public.try_consume_anonymous_ai_call()::int$$, 0, 'service role: anonym AI-kald nr. 301 afvises (døgnloft)');
select pg_temp.as_service_for('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select public.try_consume_anonymous_ai_call()::int$$, 0, 'permanent patient kan ikke bruge anonym AI-kvote');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_updated($$update public.ai_limits set value = 100000 where key = 'anon_daily_ai_calls'$$, 0, 'patient kan ikke hæve lofter');
select pg_temp.expect_count($$select count(*) from public.ai_limits$$, 0, 'patient kan ikke læse lofter');
select pg_temp.expect_error($$select public.try_consume_anonymous_ai_call(1)$$, 'klient kan ikke angive egen cap (gammel signatur fjernet)');

-- Anonym D: globalt loft er nået, så udkast afvises og der forbruges intet.
select pg_temp.as_user('00000000-0000-4000-8000-000000000104', true);
select pg_temp.expect_error($$select public.consume_summary_generation('00000000-0000-4000-8000-000000000701')$$, 'anonym udkast afvises når globalt anonymt loft er nået (ANON_CAP_REACHED)');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000701' and ai_generation_count = 0$$, 1, 'afvist udkast efterlader forespørgslens tæller uændret');
select pg_temp.expect_count($$select count(*) from public.ai_patient_usage_daily where patient_id = '00000000-0000-4000-8000-000000000104'$$, 0, 'afvist udkast efterlader ingen døgntæller');

-- ---------- 8. Billedændring nulstiller godkendelse ----------
select set_config('tm.system', 'on', false);
update public.requests set summary_text = 'Godkendt tekst', summary_approved_at = now() where id = '00000000-0000-4000-8000-000000000202';
select set_config('tm.system', '', false);
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000202' and summary_approved_at is not null$$, 1, 'forespørgsel 202 er godkendt før billedændring');
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101',
        (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' limit 1),
        '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000202/00000000-0000-4000-8000-0000000000e1.jpg', 10, 10, 10);
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000202' and summary_approved_at is null$$, 1, 'billed-insert nulstiller godkendelse');
select set_config('tm.system', 'on', false);
update public.requests set summary_approved_at = now() where id = '00000000-0000-4000-8000-000000000202';
select set_config('tm.system', '', false);
delete from public.request_images where id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000202' and summary_approved_at is null$$, 1, 'billed-delete nulstiller godkendelse');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000201' and summary_approved_at is not null$$, 1, 'sendt forespørgsel 201 er uændret');

select 'ALLE AI-LOFTS-TESTS PASSEDE' as resultat;
