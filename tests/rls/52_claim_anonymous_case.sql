-- Test 52: Overdragelse af en anonym kladde til en eksisterende patientkonto (issue_claim_token / claim_anonymous_case).
-- Kun en anonym bruger kan udstede, kun en patient med konto kan indløse, kun den anonyme brugers egen kladde flyttes,
-- tokenet virker én gang (idempotent for samme patient), og ingen kan overtage en sag ved at kende id'et.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- En ekstra anonym bruger med en tom kladde, og en anden anonym bruger med en sag (angriber).
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('pAnonEmpty'), null, true, '{}'), (tt.id('pAnonAtk'), null, true, '{}');
insert into public.cases (id, patient_id) values (tt.id('SEmpty'), tt.id('pAnonEmpty'));

-- Udstedelse: kun anonyme
select tt.as_user(tt.id('pA'));
select tt.denied('select public.issue_claim_token()', 'permanent patient kan ikke udstede', 'NOT_ANONYMOUS');
select tt.as_user(tt.id('uX'));
select tt.denied('select public.issue_claim_token()', 'klinik kan ikke udstede', 'NOT_ANONYMOUS');
select tt.as_anon();
select tt.denied('select public.issue_claim_token()', 'uden login kan ikke udstede');
select tt.denied('select public.claim_anonymous_case(repeat(''a'', 40))', 'uden login kan ikke indløse');
-- JWT'ens påstand om anonymitet er ikke nok: profilen afgør
select tt.as_user(tt.id('pA'), true);
select tt.denied('select public.issue_claim_token()', 'falsk is_anonymous i JWT hjælper ikke', 'NOT_ANONYMOUS');

-- Den anonyme udsteder et token; kun hashet gemmes, og tabellen kan ikke læses
select tt.as_user(tt.id('pAnon'), true);
select set_config('tt.tok', tt.q('select public.issue_claim_token()->>''token'''), true);
select tt.ok(char_length(current_setting('tt.tok')) = 64, 'tokenet er 64 tegn');
select tt.rows('select 1 from public.anonymous_claims', 0, 'anonym kan ikke læse claim-tabellen');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.anonymous_claims', 0, 'patient kan ikke læse claim-tabellen');
select tt.as_postgres();
select tt.eq((select count(*) from public.anonymous_claims where token_hash = current_setting('tt.tok'))::int, 0, 'tokenet gemmes ikke i klartekst');
select tt.eq((select count(*) from public.anonymous_claims where anon_id = tt.id('pAnon'))::int, 1, 'hash gemt for den anonyme');

-- Direkte flytning af en sags ejer er forbudt, også med forkert retning og uden flag
select tt.as_user(tt.id('pA'));
select tt.affects(format('update public.cases set patient_id = %L where id = %L', tt.id('pA'), tt.id('SAnon')), 0, 'patient kan ikke tage en anonym sag via update');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('update public.cases set patient_id = %L where id = %L', tt.id('pA'), tt.id('SAnon')), 'anonym kan ikke give sagen væk direkte');
select tt.as_postgres();
select tt.denied(format('update public.cases set patient_id = %L where id = %L', tt.id('pA'), tt.id('SAnon')), 'ejerskifte uden claim-flag afvises', 'Feltet kan ikke ændres');
select tt.denied(format('select set_config(''tm.claim'', ''on'', true); update public.cases set patient_id = %L where id = %L', tt.id('pB'), tt.id('S')),
                 'ejerskifte mellem permanente patienter afvises selv med flag');

-- Angreb: ugyldige, korte og gættede tokens
select tt.as_user(tt.id('pA'));
select tt.denied('select public.claim_anonymous_case(null)', 'null-token', 'CLAIM_INVALID');
select tt.denied('select public.claim_anonymous_case(''kort'')', 'for kort token', 'CLAIM_INVALID');
select tt.denied(format('select public.claim_anonymous_case(%L)', repeat('a', 64)), 'gættet token', 'CLAIM_INVALID');
select tt.denied(format('select public.claim_anonymous_case(%L)', tt.id('SAnon')::text), 'sags-id er ikke et token', 'CLAIM_INVALID');
select tt.denied(format('select public.claim_anonymous_case(%L)', tt.id('pAnon')::text || tt.id('pAnon')::text), 'anonymt bruger-id er ikke et token', 'CLAIM_INVALID');
-- Klinik og anonym kan ikke indløse
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.claim_anonymous_case(%L)', current_setting('tt.tok')), 'klinik kan ikke indløse', 'FORBIDDEN');
select tt.as_user(tt.id('pAnonAtk'), true);
select tt.denied(format('select public.claim_anonymous_case(%L)', current_setting('tt.tok')), 'anonym kan ikke indløse', 'ACCOUNT_REQUIRED');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 0, 'angriber ser ikke sagen');
select tt.as_postgres();
select tt.eq((select patient_id from public.cases where id = tt.id('SAnon')), tt.id('pAnon'), 'sagen ligger stadig hos den anonyme efter afviste forsøg');

-- Udløbet token
update public.anonymous_claims set expires_at = now() - interval '1 minute' where anon_id = tt.id('pAnon');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.claim_anonymous_case(%L)', current_setting('tt.tok')), 'udløbet token', 'CLAIM_INVALID');
select tt.as_postgres();
update public.anonymous_claims set expires_at = now() + interval '10 minutes' where anon_id = tt.id('pAnon');

-- Indløsning af den rigtige patient
select tt.as_user(tt.id('pA'));
select set_config('tt.res', public.claim_anonymous_case(current_setting('tt.tok'))::text, true);
select tt.eq((current_setting('tt.res')::jsonb->>'moved')::boolean, true, 'kladden er flyttet');
select tt.eq((current_setting('tt.res')::jsonb->>'case_id')::uuid, tt.id('SAnon'), 'svaret peger på den overtagne sag');
select tt.eq((current_setting('tt.res')::jsonb->>'anon_id')::uuid, tt.id('pAnon'), 'første svar indeholder anon_id til sletning');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 1, 'pA ejer nu sagen');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('S')), 1, 'pAs egen sag er urørt');
select tt.rows(format('select 1 from public.ai_messages where conversation_id = %L', tt.id('convSAnon')), 2, 'chatten fulgte med');
select tt.rows(format('select 1 from public.ai_conversations where case_id = %L and patient_id = %L', tt.id('SAnon'), tt.id('pA')), 1, 'samtalen fulgte med');
select tt.rows(format('select 1 from public.case_images where case_id = %L', tt.id('SAnon')), 1, 'billedet fulgte med');
select tt.rows(format('select 1 from public.case_services where case_id = %L', tt.id('SAnon')), 2, 'ydelserne fulgte med');
select tt.rows('select 1 from public.consents where granted_while_anonymous', 2, 'de anonyme samtykker fulgte med');
select tt.eq(public.has_active_consent('image_upload'), true, 'image_upload er aktivt');
select tt.eq((select postal_code from public.cases where id = tt.id('SAnon')), '2100', 'postnummer bevaret');

-- Idempotent for samme patient, uden anon_id; andre får CLAIM_INVALID
select set_config('tt.res2', public.claim_anonymous_case(current_setting('tt.tok'))::text, true);
select tt.eq((current_setting('tt.res2')::jsonb->>'case_id')::uuid, tt.id('SAnon'), 'dobbelt claim giver samme sag');
select tt.eq((current_setting('tt.res2')::jsonb->>'already_claimed')::boolean, true, 'dobbelt claim er markeret');
select tt.ok(current_setting('tt.res2')::jsonb->'anon_id' is null, 'dobbelt claim udleverer ikke anon_id');
select tt.rows('select 1 from public.cases where id = ' || quote_literal(tt.id('SAnon')), 1, 'stadig kun én sag med id');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.claim_anonymous_case(%L)', current_setting('tt.tok')), 'brugt token kan ikke indløses af andre', 'CLAIM_INVALID');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 0, 'pB ser ikke sagen');
select tt.rows(format('select 1 from public.ai_messages where conversation_id = %L', tt.id('convSAnon')), 0, 'pB ser ikke chatten');
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 0, 'klinik ser ikke sagen');
-- Den anonyme har intet tilbage
select tt.as_user(tt.id('pAnon'), true);
select tt.rows('select 1 from public.cases', 0, 'den anonyme har ingen sager tilbage');
select tt.rows('select 1 from public.consents', 0, 'den anonyme har ingen samtykker tilbage');

-- Tom kladde flyttes ikke; sagen bliver hos den anonyme
select tt.as_user(tt.id('pAnonEmpty'), true);
select set_config('tt.tok2', tt.q('select public.issue_claim_token()->>''token'''), true);
select tt.as_user(tt.id('pB'));
select set_config('tt.res3', public.claim_anonymous_case(current_setting('tt.tok2'))::text, true);
select tt.eq((current_setting('tt.res3')::jsonb->>'moved')::boolean, false, 'tom kladde flyttes ikke');
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SEmpty')), 0, 'pB ejer ikke den tomme kladde');

-- Eksisterende kladde hos patienten bevares: pB har SB (kladde) og får en ekstra sag
select tt.as_postgres();
insert into public.cases (id, patient_id, postal_code) values (tt.id('SAtk'), tt.id('pAnonAtk'), '2100');
select tt.as_user(tt.id('pAnonAtk'), true);
select set_config('tt.tok3', tt.q('select public.issue_claim_token()->>''token'''), true);
select tt.as_user(tt.id('pB'));
select set_config('tt.res4', public.claim_anonymous_case(current_setting('tt.tok3'))::text, true);
select tt.eq((current_setting('tt.res4')::jsonb->>'moved')::boolean, true, 'ekstra sag flyttet');
select tt.rows('select 1 from public.cases where status = ''draft''', 2, 'pB har sin egen kladde og den overtagne');

-- En anonym, der er blevet permanent, kan ikke overdrages (token fra før konvertering)
select tt.as_user(tt.id('pAnonEmpty'), true);
select set_config('tt.tok4', tt.q('select public.issue_claim_token()->>''token'''), true);
select tt.as_postgres();
update auth.users set is_anonymous = false, email = 'konv@test.invalid', raw_user_meta_data = '{"role":"patient","first_name":"K"}' where id = tt.id('pAnonEmpty');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.claim_anonymous_case(%L)', current_setting('tt.tok4')), 'konverteret konto kan ikke overdrages', 'CLAIM_INVALID');
select tt.as_user(tt.id('pAnonEmpty'));
select tt.denied('select public.issue_claim_token()', 'efter konvertering kan der ikke udstedes', 'NOT_ANONYMOUS');

rollback;
