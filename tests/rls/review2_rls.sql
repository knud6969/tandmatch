-- Tests for server-only skrivninger og låst opsummering (reviewer runde 2).
-- Kører efter 00_supabase_auth_stub, alle migrationer, skelet_rls, trin2_rls og ai_limits_rls.

create function pg_temp.as_user(p_uid uuid, p_anon boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role service_role';
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
  if st is distinct from p_state then
    raise exception 'FEJL: % forventede SQLSTATE %, fik % (%)', p_label, p_state, st, sqlerrm;
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

-- Fixtures (som ejer). A = ...0101 (permanent, har ai_processing fra trin2-fixtures).
select pg_temp.as_db_owner();
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000802', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype');
insert into public.ai_conversations (id, request_id, patient_id, ai_consent_id) values
  ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000801', '00000000-0000-4000-8000-000000000101',
   (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'ai_processing' and withdrawn_at is null limit 1));

-- ---------- 1. Patient kan kun skrive brugerbeskeder ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_updated($$insert into public.ai_messages (conversation_id, patient_id, role, content) values ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000101', 'user', 'Hej')$$, 1, 'patient skriver brugerbesked');
select pg_temp.expect_error($$insert into public.ai_messages (conversation_id, patient_id, role, content) values ('00000000-0000-4000-8000-000000000811', '00000000-0000-4000-8000-000000000101', 'assistant', 'Injiceret svar')$$, 'patient kan ikke indsætte assistentsvar direkte', '42501');
select pg_temp.expect_error($$select public.append_assistant_message('00000000-0000-4000-8000-000000000811', 'Injiceret', array[]::text[], false, false)$$, 'patient kan ikke kalde append_assistant_message', '42501');
select pg_temp.expect_error($$select public.store_ai_summary('00000000-0000-4000-8000-000000000801', '{"x":1}'::jsonb, true)$$, 'patient kan ikke kalde store_ai_summary', '42501');

-- ---------- 2. Patient kan ikke skrive AI-felter eller opsummering direkte ----------
select pg_temp.expect_error($$update public.requests set ai_summary = '{"x":1}'::jsonb where id = '00000000-0000-4000-8000-000000000801'$$, 'patient kan ikke skrive ai_summary', '42501');
select pg_temp.expect_error($$update public.requests set summary_ai_assisted = true where id = '00000000-0000-4000-8000-000000000801'$$, 'patient kan ikke sætte summary_ai_assisted', '42501');
select pg_temp.expect_error($$update public.requests set summary_text = 'Direkte' where id = '00000000-0000-4000-8000-000000000802'$$, 'patient kan ikke skrive summary_text uden godkendelse', '42501');

-- ---------- 3. Godkendelse låser opsummeringen ----------
select pg_temp.expect_count($$select (public.approve_summary('00000000-0000-4000-8000-000000000801', 'Godkendt tekst') is not null)::int$$, 1, 'patient godkender via approve_summary');
select pg_temp.expect_error($$update public.requests set summary_text = 'Ændret efter godkendelse' where id = '00000000-0000-4000-8000-000000000801'$$, 'patient kan ikke ændre summary_text efter godkendelse', '42501');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000801' and summary_text = 'Godkendt tekst' and summary_approved_at is not null$$, 1, 'godkendt tekst er uændret');
select pg_temp.expect_updated($$update public.requests set answers = '{"start":"hurtigst"}' where id = '00000000-0000-4000-8000-000000000801'$$, 1, 'ændring af svar nulstiller godkendelse');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000801' and summary_approved_at is null and summary_text = 'Godkendt tekst'$$, 1, 'godkendelse nulstillet, tekst bevaret');
select pg_temp.expect_error($$update public.requests set summary_approved_at = now() where id = '00000000-0000-4000-8000-000000000801'$$, 'patient kan ikke sætte godkendelse direkte', '42501');

-- ---------- 4. Service role: assistentsvar og AI-udkast ----------
select pg_temp.as_service();
select pg_temp.expect_count($$select count(*) from (select (public.append_assistant_message('00000000-0000-4000-8000-000000000811', 'Tak for din beskrivelse.', array[]::text[], false, true)).id) x$$, 1, 'service role skriver assistentsvar');
select public.store_ai_summary('00000000-0000-4000-8000-000000000801', '{"summaryText":"Udkast"}'::jsonb, true);
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.ai_messages where conversation_id = '00000000-0000-4000-8000-000000000811' and role = 'assistant' and ready_for_summary$$, 1, 'assistentsvar gemt af server');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000801' and ai_summary is not null and summary_ai_assisted$$, 1, 'AI-udkast gemt af server');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.append_assistant_message('00000000-0000-4000-8000-000000000811', 'Igen', array[]::text[], false, false)$$, 'patient kan stadig ikke kalde assistent-funktion efter test', '42501');
select pg_temp.as_db_owner();

-- ---------- 5. Chatbesked nulstiller godkendelse i samme transaktion (reviewer runde 3) ----------
select pg_temp.as_db_owner();
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype');
insert into public.ai_conversations (id, request_id, patient_id, ai_consent_id) values
  ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-000000000803', '00000000-0000-4000-8000-000000000101',
   (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'ai_processing' and withdrawn_at is null limit 1));
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select (public.approve_summary('00000000-0000-4000-8000-000000000803', 'Godkendt før chat') is not null)::int$$, 1, 'opsummering godkendes før chat');
select pg_temp.expect_updated($$insert into public.ai_messages (conversation_id, patient_id, role, content) values ('00000000-0000-4000-8000-000000000813', '00000000-0000-4000-8000-000000000101', 'user', 'Ny oplysning')$$, 1, 'patient sender chatbesked efter godkendelse');
select pg_temp.as_service();
select pg_temp.expect_count($$select count(*) from (select (public.append_assistant_message('00000000-0000-4000-8000-000000000813', 'Svar på ny oplysning.', array[]::text[], false, false)).id) x$$, 1, 'assistentsvar lykkes efter godkendelse');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000803' and summary_approved_at is null$$, 1, 'chatbesked nulstiller godkendelse i samme transaktion');

-- ---------- 6. Anonym klient kan ikke udtømme det fælles døgnloft (DoS) ----------
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000105', null, '{}', true);
select pg_temp.as_user('00000000-0000-4000-8000-000000000105', true);
select pg_temp.expect_error($$select public.try_consume_anonymous_ai_call()$$, 'anonym klient kan ikke kalde det fælles loft via RPC', '42501');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.ai_usage_daily where day = (now() at time zone 'utc')::date and anonymous_calls > 300$$, 0, 'det fælles loft er uberørt af klientforsøg');

select 'ALLE REVIEW-2-TESTS PASSEDE' as resultat;
