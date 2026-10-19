-- Test 13: Efter kontooprettelse har brugeren samme id og ser fortsat sin kladde, chat, billeder og samtykker;
-- en anden bruger med case_id får intet.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Før konvertering: anonym session ser sine egne data
select tt.as_user(tt.id('pAnon'), true);
select tt.rows('select 1 from public.cases', 1, 'før: anonym ser sin kladde');
select tt.rows('select 1 from public.ai_messages', 2, 'før: anonym ser sin chat');
select tt.rows('select 1 from public.case_images', 1, 'før: anonym ser sit billede');
select tt.rows('select 1 from public.consents', 2, 'før: anonym ser sine samtykker');

-- Konvertering (Supabase sætter is_anonymous = false og tilføjer e-mail; id bevares)
select tt.as_postgres();
update auth.users set is_anonymous = false, email = 'opgraderet@test.invalid',
       raw_user_meta_data = '{"role":"patient","first_name":"Anna"}' where id = tt.id('pAnon');
select tt.eq((select is_anonymous from public.profiles where id = tt.id('pAnon')), false, 'profilen følger auth.users.is_anonymous');
select tt.eq((select count(*) from public.profiles where id = tt.id('pAnon'))::int, 1, 'samme id, samme profil');

-- Efter: samme id, permanent JWT
select tt.as_user(tt.id('pAnon'), false);
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 1, 'efter: kladden er bevaret');
select tt.rows(format('select 1 from public.ai_conversations where case_id = %L', tt.id('SAnon')), 1, 'efter: samtalen er bevaret');
select tt.rows('select 1 from public.ai_messages', 2, 'efter: chatten er bevaret');
select tt.rows(format('select 1 from public.case_images where case_id = %L', tt.id('SAnon')), 1, 'efter: billedet er bevaret');
select tt.rows('select 1 from public.consents', 2, 'efter: samtykkerne er bevaret');
select tt.eq(public.has_active_consent('image_upload'), true, 'efter: image_upload er stadig aktivt');
select tt.eq(public.has_active_consent('ai_processing'), true, 'efter: ai_processing er stadig aktivt');
-- Nu må brugeren give health_data_sharing
select tt.allowed(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, false)',
                         tt.id('pAnon'), 'health_data_sharing', 'health_data_sharing@v1-klinikker'), 'efter: health_data_sharing kan gives');

-- En anden bruger med case_id får intet
select tt.as_user(tt.id('pB'));
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 0, 'andre kan ikke læse den konverterede sag');
select tt.rows(format('select 1 from public.ai_messages where conversation_id = %L', tt.id('convSAnon')), 0, 'andre kan ikke læse den konverterede chat');
select tt.rows(format('select 1 from public.case_images where case_id = %L', tt.id('SAnon')), 0, 'andre kan ikke læse det konverterede billede');
select tt.rows(format('select 1 from public.consents where patient_id = %L', tt.id('pAnon')), 0, 'andre kan ikke læse de konverterede samtykker');
select tt.denied(format('insert into public.case_services (case_id, service_id) values (%L, %L)', tt.id('SAnon'), tt.svc('blegning')), 'andre kan ikke skrive til den konverterede sag');
select tt.denied(format('insert into public.ai_messages (conversation_id, patient_id, role, content) values (%L, %L, %L, %L)', tt.id('convSAnon'), tt.id('pB'), 'user', 'indbrud'),
                 'andre kan ikke skrive i den konverterede chat');

-- En klinik kan heller ikke
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('SAnon')), 0, 'klinik kan ikke læse den konverterede sag');

rollback;
