-- Test 41 (3.7b M1, M2, L1):
--   - reserve_chat_turn() og consume_summary_generation() kan ikke kaldes med patientens eller en anonym JWT
--   - consume_summary_generation(p_user_id, ...) tjekker ejer, samtykke og kladde for p_user_id selv
--   - ingen direkte insert i ai_messages (hverken som bruger eller anonym)
--   - døgnloftet for chatbeskeder overlever, at sagen slettes og oprettes igen
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- M2: ikke kaldbare med brugerens eller en anonym JWT (permission denied), uanset p_user_id
select tt.as_user(tt.id('pA'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pA'), tt.id('convS'), 'x'), 'authenticated kan ikke kalde reserve_chat_turn', '42501');
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pA'), tt.id('S')), 'authenticated kan ikke kalde consume_summary_generation', '42501');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pAnon'), tt.id('convSAnon'), 'x'), 'anonym bruger kan ikke kalde reserve_chat_turn', '42501');
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pAnon'), tt.id('SAnon')), 'anonym bruger kan ikke kalde consume_summary_generation', '42501');
select tt.as_anon();
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pA'), tt.id('convS'), 'x'), 'anon rolle kan ikke kalde reserve_chat_turn', '42501');
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pA'), tt.id('S')), 'anon rolle kan ikke kalde consume_summary_generation', '42501');

-- Service role: ejer, samtykke og kladde tjekkes for p_user_id
select tt.as_service();
select tt.allowed(format('select public.consume_summary_generation(%L, %L)', tt.id('pA'), tt.id('S')), 'service role: ejeren kan forbruge en generering');
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pB'), tt.id('S')), 'en anden patients id afvises (ikke ejer)', 'NOT_FOUND');
select tt.denied(format('select public.consume_summary_generation(%L::uuid, %L)', null, tt.id('S')), 'uden bruger-id afvises', 'UNAUTHENTICATED');
select tt.as_postgres();
select tt.eq((select ai_generation_count from public.cases where id = tt.id('S')), 1, 'kun ejerens kald talte');
update public.consents set withdrawn_at = now() where patient_id = tt.id('pA') and type = 'ai_processing';
select tt.as_service();
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pA'), tt.id('S')), 'uden aktivt samtykke afvises', 'CONSENT_REQUIRED');
select tt.as_postgres();
insert into public.consents (patient_id, type, text_version) values (tt.id('pA'), 'ai_processing', 'ai_processing@v0-prototype');

-- Anonym bruger forbruger sit eget døgnloft også ved opsummering
update public.ai_limits set value = 1 where key = 'anon_user_daily_ai_calls';
delete from public.ai_anon_user_usage_daily;
-- API-tests kan have talt op i dag, så testen måler forskellen i stedet for at antage et tomt globalt loft.
create temp table global_before as select coalesce((select anonymous_calls from public.ai_usage_daily where day = current_date), 0) as n;
grant select on global_before to public;
select tt.as_service();
select tt.allowed(format('select public.consume_summary_generation(%L, %L)', tt.id('pAnon'), tt.id('SAnon')), 'anonym: første opsummering');
select tt.denied(format('select public.consume_summary_generation(%L, %L)', tt.id('pAnon'), tt.id('SAnon')), 'anonym: eget døgnloft nået', 'ANON_USER_LIMIT');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily where day = current_date) - (select n from global_before), 1, 'afvist kald forbrugte intet af det globale loft');
update public.ai_limits set value = 40 where key = 'anon_user_daily_ai_calls';

-- L1: ingen direkte insert i ai_messages
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.ai_messages (conversation_id, patient_id, role, content) values (%L, %L, %L, %L)', tt.id('convS'), tt.id('pA'), 'user', 'direkte'),
                 'bruger kan ikke indsætte i ai_messages', '42501');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('insert into public.ai_messages (conversation_id, patient_id, role, content) values (%L, %L, %L, %L)', tt.id('convSAnon'), tt.id('pAnon'), 'user', 'direkte'),
                 'anonym bruger kan ikke indsætte i ai_messages', '42501');
select tt.as_postgres();
select tt.ok(not exists (select 1 from pg_policies where tablename = 'ai_messages' and cmd = 'INSERT'), 'ingen insert-policy på ai_messages');

-- M1: døgnloftet overlever, at sagen slettes og oprettes igen
update public.ai_limits set value = 3 where key = 'chat_messages_per_patient_day';
delete from public.ai_patient_usage_daily where patient_id = tt.id('pC');
insert into public.consents (patient_id, type, text_version) values (tt.id('pC'), 'ai_processing', 'ai_processing@v0-prototype');
select tt.mk_case('pC', 'C1', p_approve => false);
insert into public.ai_conversations (id, case_id, patient_id, ai_consent_id) values (tt.id('convC1'), tt.id('C1'), tt.id('pC'), tt.consent('pC', 'ai_processing'));
select tt.as_service();
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pC'), tt.id('convC1'), 'a'), 'besked 1');
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pC'), tt.id('convC1'), 'b'), 'besked 2');
select tt.as_postgres();
-- slet sagen (samtalen og beskederne følger med) og opret en ny
delete from public.cases where id = tt.id('C1');
select tt.eq((select count(*)::integer from public.ai_messages where patient_id = tt.id('pC')), 0, 'beskederne er slettet med sagen');
select tt.mk_case('pC', 'C2', p_approve => false);
insert into public.ai_conversations (id, case_id, patient_id, ai_consent_id) values (tt.id('convC2'), tt.id('C2'), tt.id('pC'), tt.consent('pC', 'ai_processing'));
select tt.as_service();
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pC'), tt.id('convC2'), 'c'), 'besked 3 (sidste tilladte)');
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L, %L)', tt.id('pC'), tt.id('convC2'), 'd'), 'besked 4 afvises, selvom sagen er ny', 'RATE_LIMITED');
select tt.as_postgres();
select tt.eq((select chat_messages from public.ai_patient_usage_daily where patient_id = tt.id('pC') and day = (now() at time zone 'utc')::date), 3, 'tælleren står på 3');

rollback;
