-- Test 39 (3.6b H1, L1): reserve_chat_turn() tæller lofterne og indsætter patientens besked i én transaktion.
--   - kun ejeren kan reservere (andre: NOT_FOUND, uden login: afvist)
--   - 30 beskeder pr. samtale (CHAT_LIMIT), døgnloft pr. patient (RATE_LIMITED)
--   - anonym: loft pr. bruger pr. døgn (ANON_USER_LIMIT) og globalt loft (ANON_CAP_REACHED); én bruger kan ikke tømme det globale
--   - afviste kald indsætter intet og forbruger intet
--   - append_assistant_message() afviser svar uden aktivt samtykke og på samtaler lukket af andet end loftet
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.user_messages(p_conv text) returns integer language sql stable as $$
  select count(*)::integer from public.ai_messages where conversation_id = tt.id(p_conv) and role = 'user'
$$;

-- Ejer: reservationen indsætter besked og returnerer antallet (fixture: 1 besked i forvejen)
select tt.as_user(tt.id('pA'));
select tt.eq((select r.user_message_count from public.reserve_chat_turn(tt.id('convS'), 'Jeg vil gerne have blegning') r), 2,
             'første reservation giver tæller 2');
select tt.eq((select r.message_content from public.reserve_chat_turn(tt.id('convS'), 'Endnu en besked') r), 'Endnu en besked', 'indholdet returneres');
select tt.as_postgres();
select tt.eq(tt.user_messages('convS'), 3, 'to reservationer indsatte to brugerbeskeder');
select tt.eq((select role::text from public.ai_messages where conversation_id = tt.id('convS') and content = 'Endnu en besked'), 'user', 'rollen er user');

-- Andre og ikke-loggede
select tt.as_user(tt.id('pB'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), 'x'), 'en anden patient kan ikke reservere på andres samtale', 'NOT_FOUND');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), 'x'), 'klinik kan ikke reservere', 'NOT_FOUND');
select tt.as_anon();
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), 'x'), 'anon (uden login) kan ikke kalde funktionen', '42501');
select tt.as_service();
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), 'x'), 'service role har ingen bruger', 'UNAUTHENTICATED');

-- Ugyldigt indhold
select tt.as_user(tt.id('pA'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), '   '), 'tom besked afvises', 'INVALID_INPUT');
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), repeat('x', 1001)), 'for lang besked afvises', 'INVALID_INPUT');

-- Loft på 30 pr. samtale: samtalen har 3 beskeder; 27 mere giver 30, derefter CHAT_LIMIT og lukket samtale
select count(*) from generate_series(1, 27) g, lateral public.reserve_chat_turn(tt.id('convS'), 'besked ' || g);
select tt.as_postgres();
select tt.eq(tt.user_messages('convS'), 30, 'samtalen har præcis 30 brugerbeskeder');
select tt.eq((select status::text from public.ai_conversations where id = tt.id('convS')), 'closed', 'samtalen lukkes ved 30');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convS'), 'nummer 31'), 'besked 31 afvises', 'CHAT_LIMIT');
select tt.as_postgres();
select tt.eq(tt.user_messages('convS'), 30, 'den afviste besked blev ikke indsat');

-- L1: svaret på den 30. besked kan gemmes (lukket af loftet, seneste besked er patientens). Alt i testen sker i én
-- transaktion med samme now(), så tidsstemplerne sættes eksplicit for en entydig rækkefølge.
select tt.as_postgres();
update public.ai_messages set created_at = now() - interval '1 hour' where conversation_id = tt.id('convS') and role = 'assistant';
select tt.as_service();
select tt.allowed(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pA'), tt.id('convS'), 'Svar på nr. 30'),
                  'svar på den 30. besked kan gemmes');
select tt.as_postgres();
-- de øvrige 28 ture er besvaret (nu er der lige så mange svar som spørgsmål)
insert into public.ai_messages (conversation_id, patient_id, role, content)
select tt.id('convS'), tt.id('pA'), 'assistant', 'Svar ' || g from generate_series(1, 28) g;
select tt.as_service();
select tt.denied(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pA'), tt.id('convS'), 'Et svar mere'),
                 'et ekstra svar på en lukket samtale afvises', 'CONVERSATION_CLOSED');

-- L1: lukket af tilbagetrækning (tæller under 30) accepterer intet svar, og uden aktivt samtykke afvises også aktive samtaler
select tt.as_postgres();
insert into public.ai_messages (conversation_id, patient_id, role, content) values (tt.id('convSB'), tt.id('pB'), 'user', 'Ubesvaret spørgsmål');
select tt.as_service();
select tt.allowed(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pB'), tt.id('convSB'), 'Svar mens samtykket er aktivt'),
                  'aktiv samtale og aktivt samtykke: svar kan gemmes');
select tt.as_postgres();
update public.consents set withdrawn_at = now() where patient_id = tt.id('pB') and type = 'ai_processing';
select tt.as_service();
select tt.denied(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pB'), tt.id('convSB'), 'Svar efter tilbagetrækning'),
                 'svar uden aktivt ai_processing-samtykke afvises', 'CONSENT_REQUIRED');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convSB'), 'x'), 'reservation uden aktivt samtykke afvises', 'CONSENT_REQUIRED');
select tt.as_postgres();
insert into public.consents (patient_id, type, text_version) values (tt.id('pB'), 'ai_processing', 'ai_processing@v0-prototype');
update public.ai_conversations set status = 'closed' where id = tt.id('convSB');
select tt.as_service();
select tt.denied(format('select public.append_assistant_message(%L, %L, %L, null, null, false, null, false, false)', tt.id('pB'), tt.id('convSB'), 'Svar på lukket samtale under loftet'),
                 'samtale lukket under loftet (fx tilbagetrækning) accepterer intet svar', 'CONVERSATION_CLOSED');

-- Døgnloft pr. patient (RATE_LIMITED) tælles på tværs af samtaler: pC får to sager og et loft på 3
select tt.as_postgres();
update public.ai_limits set value = 3 where key = 'chat_messages_per_patient_day';
insert into public.consents (patient_id, type, text_version) values (tt.id('pC'), 'ai_processing', 'ai_processing@v0-prototype');
select tt.mk_case('pC', 'C1', p_approve => false);
select tt.mk_case('pC', 'C2', p_approve => false);
insert into public.ai_conversations (id, case_id, patient_id, ai_consent_id) values
  (tt.id('convC1'), tt.id('C1'), tt.id('pC'), tt.consent('pC', 'ai_processing')),
  (tt.id('convC2'), tt.id('C2'), tt.id('pC'), tt.consent('pC', 'ai_processing'));
select tt.as_user(tt.id('pC'));
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convC1'), 'a'), 'dagsbesked 1');
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convC2'), 'b'), 'dagsbesked 2 (anden samtale)');
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convC1'), 'c'), 'dagsbesked 3');
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convC2'), 'd'), 'dagsbesked 4 afvises på tværs af samtaler', 'RATE_LIMITED');
select tt.as_postgres();
select tt.eq(tt.user_messages('convC1') + tt.user_messages('convC2'), 3, 'kun de tre tilladte beskeder er indsat');
update public.ai_limits set value = 100 where key = 'chat_messages_per_patient_day';

-- Anonymt: loft pr. bruger (2) og globalt loft (4). Bruger 1 tager sit eget loft og ikke mere, så bruger 2 stadig kan chatte.
update public.ai_limits set value = 2 where key = 'anon_user_daily_ai_calls';
update public.ai_limits set value = 4 where key = 'anon_daily_ai_calls';
delete from public.ai_usage_daily;
delete from public.ai_anon_user_usage_daily;
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values (tt.id('pAnon2'), null, true, '{}'), (tt.id('pAnon3'), null, true, '{}');
insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
select tt.id(p), 'ai_processing', 'ai_processing@v0-prototype', true from unnest(array['pAnon2', 'pAnon3']) p;
select tt.mk_case('pAnon2', 'SAnon2', p_approve => false);
select tt.mk_case('pAnon3', 'SAnon3', p_approve => false);
insert into public.ai_conversations (id, case_id, patient_id, ai_consent_id) values
  (tt.id('convAnon2'), tt.id('SAnon2'), tt.id('pAnon2'), tt.consent('pAnon2', 'ai_processing')),
  (tt.id('convAnon3'), tt.id('SAnon3'), tt.id('pAnon3'), tt.consent('pAnon3', 'ai_processing'));

select tt.as_user(tt.id('pAnon'), true);
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convSAnon'), 'anonym 1'), 'anonym bruger kald 1');
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convSAnon'), 'anonym 2'), 'anonym bruger kald 2');
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convSAnon'), 'anonym 3'), 'anonym bruger kald 3 afvises (eget loft)', 'ANON_USER_LIMIT');
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convSAnon'), 'anonym 4'), 'anonym bruger kald 4 afvises stadig', 'ANON_USER_LIMIT');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily), 2, 'afviste kald forbrugte intet af det globale loft');
select tt.eq(tt.user_messages('convSAnon'), 3, 'kun de to tilladte beskeder blev indsat (plus fixturens)');

select tt.as_user(tt.id('pAnon2'), true);
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convAnon2'), 'bruger 2, kald 1'), 'bruger 2 kan stadig chatte (globalt loft er ikke tømt af bruger 1)');
select tt.allowed(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convAnon2'), 'bruger 2, kald 2'), 'bruger 2 kald 2 (globalt loft nået: 4)');
select tt.as_user(tt.id('pAnon3'), true);
select tt.denied(format('select * from public.reserve_chat_turn(%L, %L)', tt.id('convAnon3'), 'bruger 3'), 'det globale loft afviser bruger 3', 'ANON_CAP_REACHED');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily), 4, 'det globale loft stopper ved 4');
select tt.eq(coalesce((select calls from public.ai_anon_user_usage_daily where user_id = tt.id('pAnon3')), 0), 0, 'bruger 3 har ikke forbrugt noget (global afvisning fortrydes)');
select tt.eq(tt.user_messages('convAnon3'), 0, 'ingen besked indsat for bruger 3');

-- Permanent bruger forbruger ikke det anonyme loft
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*)::integer from public.reserve_chat_turn(tt.id('convC1'), 'x') where false), 0, 'kontrol: tom forespørgsel');
select tt.as_postgres();
select tt.eq((select anonymous_calls from public.ai_usage_daily), 4, 'permanent bruger forbruger ikke det anonyme loft');

rollback;
