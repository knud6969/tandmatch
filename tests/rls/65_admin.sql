-- Test 65 (RLS-punkt 60; features/admin/README.md 4.3, 5.3; migration 20261107000200_admin):
--  * Kun en permanent admin kan kalde admin_change_clinic_status() og admin_moderate() (42501 for patient, klinik, anonym og anon).
--  * Kun overgangene registered <-> verified; afvisning kræver begrundelse; hver handling skriver én række i admin_actions.
--  * admin_actions kan kun læses af admin og skrives aldrig direkte.
--  * Admin kan stadig ikke læse sager, billeder, AI-samtaler, leads, bookinger, beskeder, outbox, push-tokens, samtykker,
--    patientprofiler eller favoritter, og kan ikke ændre klinikker eller anmeldelser direkte.
--  * M1 (migration 20261110000200): med admins egen JWT kan reviews (og dermed patient_id/booking_id), review_replies,
--    andres profiles og terms_acceptances ikke læses direkte; admin_reviews()/admin_review_replies() giver moderationsfelterne
--    uden patient- og bookingreference og kan kun kaldes af admin.
--  * H1: admin_clinic_owners() giver ejerens e-mail kun til admin; registered -> verified kræver en begrundelse.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_admin();

-- Data, admin ikke må se: lead, booking, besked, push-token, favorit, anmeldelse (pending) og svar.
select tt.mk_case('pA', 'A_done');
select tt.mk_booking(tt.mk_lead('A_done', 'X', 'booked'), 'undersoegelse', now() - interval '3 days', 'completed');
select tt.mk_lead('S', 'X');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Hej klinik');
select tt.as_user(tt.id('pA'));
select public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
select tt.as_postgres();
insert into public.favorite_clinics (patient_id, clinic_id) values (tt.id('pA'), tt.cid('X'));
insert into public.reviews (booking_id, stars, text, price_accuracy)
values (tt.booking(tt.lead('A_done', 'X')), 4, 'Fin behandling og klar kommunikation om prisen.', 'as_quoted');
select set_config('tt.review', (select id::text from public.reviews where booking_id = tt.booking(tt.lead('A_done', 'X'))), true);
update public.reviews set moderation_status = 'approved' where id = current_setting('tt.review')::uuid;
insert into public.review_replies (review_id, text) values (current_setting('tt.review')::uuid, 'Tak for din anmeldelse.');
update public.reviews set moderation_status = 'pending' where id = current_setting('tt.review')::uuid;
select set_config('tt.reply', (select id::text from public.review_replies where review_id = current_setting('tt.review')::uuid), true);

-- Ikke-admin kan ikke kalde funktionerne.
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'')', tt.cid('X')), 'patient afvises', '42501');
select tt.denied(format('select public.admin_moderate(''review'', %L, ''approved'')', current_setting('tt.review')), 'patient kan ikke moderere', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'')', tt.cid('X')), 'klinik afvises', '42501');
select tt.denied(format('select public.admin_moderate(''review'', %L, ''approved'')', current_setting('tt.review')), 'klinik kan ikke moderere', '42501');
select tt.denied(format('select public.admin_moderate(''reply'', %L, ''approved'')', current_setting('tt.reply')), 'klinik kan ikke godkende eget svar', '42501');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'')', tt.cid('X')), 'anonym afvises', '42501');
select tt.as_anon();
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'')', tt.cid('X')), 'anon-rollen afvises', '42501');
select tt.denied(format('select public.admin_moderate(''review'', %L, ''approved'')', current_setting('tt.review')), 'anon kan ikke moderere', '42501');
-- En admin uden permanent konto (anonym JWT) afvises også.
select tt.as_user(tt.id('admin'), true);
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'')', tt.cid('X')), 'anonym admin-JWT afvises', '42501');

-- Klinikstatus
select tt.as_user(tt.id('admin'));
select tt.eq((select public.admin_change_clinic_status(tt.cid('Y'), 'registered', '  Pause for test  ')), 'registered'::public.clinic_status, 'Y sat på pause');
select tt.as_postgres();
select tt.eq((select status::text from public.clinics where id = tt.cid('Y')), 'registered', 'status ændret');
select tt.ok((select verified_at is null from public.clinics where id = tt.cid('Y')), 'verified_at nulstillet');
select tt.as_user(tt.id('admin'));
select tt.denied(format('select public.admin_change_clinic_status(%L, ''verified'')', tt.cid('Y')), 'verificering uden begrundelse afvises', 'REASON_REQUIRED');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''verified'', ''   '')', tt.cid('Y')), 'verificering med tom begrundelse afvises', 'REASON_REQUIRED');
select tt.eq((select public.admin_change_clinic_status(tt.cid('Y'), 'verified', 'CVR kontrolleret mod virk.dk')), 'verified'::public.clinic_status, 'Y verificeret igen');
select tt.eq((select public.admin_change_clinic_status(tt.cid('R'), 'verified', 'Ejer bekræftet pr. telefon')), 'verified'::public.clinic_status, 'R verificeret');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''verified'')', tt.cid('Y')), 'samme status afvises', 'INVALID_STATUS_TRANSITION');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''imported'')', tt.cid('Y')), 'imported kan ikke sættes', 'INVALID_STATUS_TRANSITION');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''removed'')', tt.cid('Y')), 'removed kan ikke sættes', 'INVALID_STATUS_TRANSITION');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''verified'')', tt.cid('I')), 'importeret klinik kan ikke verificeres', 'INVALID_STATUS_TRANSITION');
select tt.denied('select public.admin_change_clinic_status(gen_random_uuid(), ''verified'')', 'ukendt klinik', 'NOT_FOUND');
select tt.denied(format('select public.admin_change_clinic_status(%L, ''registered'', %L)', tt.cid('Z'), repeat('x', 501)), 'begrundelse over 500 tegn', '22023');

-- Moderation
select tt.denied(format('select public.admin_moderate(''review'', %L, ''rejected'')', current_setting('tt.review')), 'afvisning uden begrundelse', 'REASON_REQUIRED');
select tt.denied(format('select public.admin_moderate(''review'', %L, ''rejected'', ''   '')', current_setting('tt.review')), 'afvisning med tom begrundelse', 'REASON_REQUIRED');
select tt.denied(format('select public.admin_moderate(''review'', %L, ''pending'')', current_setting('tt.review')), 'pending kan ikke sættes', '22023');
select tt.denied(format('select public.admin_moderate(''clinic'', %L, ''approved'')', current_setting('tt.review')), 'ukendt art', '22023');
select tt.denied('select public.admin_moderate(''review'', gen_random_uuid(), ''approved'')', 'ukendt anmeldelse', 'NOT_FOUND');
select tt.denied(format('select public.admin_moderate(''reply'', %L, ''approved'')', current_setting('tt.review')), 'anmeldelsens id er ikke et svar', 'NOT_FOUND');
select tt.eq((select public.admin_moderate('review', current_setting('tt.review')::uuid, 'rejected', 'Personoplysninger om andre')), 'rejected'::public.moderation_status, 'afvist');
select tt.as_postgres();
select tt.eq((select rejection_reason from public.reviews where id = current_setting('tt.review')::uuid), 'Personoplysninger om andre', 'begrundelse gemt');
select tt.ok((select moderated_by = tt.id('admin') and moderated_at is not null from public.reviews where id = current_setting('tt.review')::uuid), 'moderator og tidspunkt gemt');
select tt.as_user(tt.id('admin'));
select tt.eq((select public.admin_moderate('review', current_setting('tt.review')::uuid, 'approved')), 'approved'::public.moderation_status, 'godkendt efter afvisning');
select tt.as_postgres();
select tt.ok((select rejection_reason is null from public.reviews where id = current_setting('tt.review')::uuid), 'begrundelse fjernet ved godkendelse');
select tt.eq((select count(*)::int from public.reviews r where r.moderation_status = 'approved' and r.id = current_setting('tt.review')::uuid), 1, 'anmeldelsen er godkendt');
select tt.as_user(tt.id('admin'));
select tt.eq((select public.admin_moderate('reply', current_setting('tt.reply')::uuid, 'approved')), 'approved'::public.moderation_status, 'svar godkendt');
select tt.eq((select public.admin_moderate('reply', current_setting('tt.reply')::uuid, 'rejected', 'Irrelevant indhold')), 'rejected'::public.moderation_status, 'svar afvist');
select tt.as_postgres();
select tt.eq((select moderation_status::text from public.review_replies where id = current_setting('tt.reply')::uuid), 'rejected', 'svar står som afvist');

-- Log (kun rækker fra denne transaktion: created_at = now(), så demodata og tidligere kørsler ikke tæller med)
select tt.as_user(tt.id('admin'));
select tt.eq((select count(*)::int from public.admin_actions where created_at >= now() and action = 'clinic_status'), 3, 'tre statusændringer logget');
select tt.eq((select reason from public.admin_actions where created_at >= now() and action = 'clinic_status' and to_value = 'verified' and target_id = tt.cid('R')), 'Ejer bekræftet pr. telefon', 'begrundelsen ved verificering logges');
select tt.eq((select count(*)::int from public.admin_actions where created_at >= now() and action = 'moderate_review'), 2, 'to anmeldelsesmoderationer logget');
select tt.eq((select count(*)::int from public.admin_actions where created_at >= now() and action = 'moderate_reply'), 2, 'to svarmoderationer logget');
select tt.eq((select reason from public.admin_actions where created_at >= now() and action = 'clinic_status' and to_value = 'registered' and target_id = tt.cid('Y')), 'Pause for test', 'begrundelsen er trimmet');
select tt.eq((select from_value || '>' || to_value from public.admin_actions where created_at >= now() and action = 'moderate_review' and reason is null), 'rejected>approved', 'før- og efterværdi');
select tt.ok((select bool_and(admin_id = tt.id('admin')) from public.admin_actions where created_at >= now()), 'admin_id er den kaldende');
select tt.denied('insert into public.admin_actions (action, target_id, from_value, to_value) values (''clinic_status'', gen_random_uuid(), ''a'', ''b'')', 'direkte INSERT afvises', '42501');
select tt.denied('update public.admin_actions set reason = ''x''', 'direkte UPDATE afvises', '42501');
select tt.denied('delete from public.admin_actions', 'direkte DELETE afvises', '42501');
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.admin_actions', 0, 'klinik ser ikke loggen');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.admin_actions', 0, 'patient ser ikke loggen');
select tt.as_anon();
select tt.rows('select 1 from public.admin_actions', 0, 'anon ser ikke loggen');

-- Admin kan ikke ændre direkte
select tt.as_user(tt.id('admin'));
select tt.denied(format('update public.clinics set status = ''verified'' where id = %L', tt.cid('R')), 'direkte statusændring afvises');
select tt.affects(format('update public.clinics set name = ''Hacket'' where id = %L', tt.cid('Z')), 0, 'admin kan ikke redigere klinikker');
select tt.denied(format('update public.reviews set moderation_status = ''approved'' where id = %L', current_setting('tt.review')), 'direkte moderation afvises', '42501');
select tt.denied(format('update public.review_replies set moderation_status = ''approved'' where id = %L', current_setting('tt.reply')), 'direkte svarmoderation afvises', '42501');

-- Admin ser klinikker direkte, men anmeldelser og svar kun gennem funktionerne (M1)
select tt.ok(tt.vis('select 1 from public.clinics') >= 13, 'admin ser klinikker');
select tt.rows('select 1 from public.reviews', 0, 'admin kan ikke læse reviews direkte (patient_id og booking_id)');
select tt.rows('select 1 from public.review_replies', 0, 'admin kan ikke læse review_replies direkte');
select tt.rows(format('select 1 from public.profiles where id <> %L', tt.id('admin')), 0, 'admin ser ikke andres profiler (e-mail, rolle, navn)');
select tt.rows(format('select 1 from public.profiles where id = %L', tt.id('admin')), 1, 'admin ser sin egen profil');
select tt.rows(format('select 1 from public.terms_acceptances where user_id <> %L', tt.id('admin')), 0, 'admin ser ikke andres vilkårsaccepter');
select tt.eq((select count(*)::int from public.admin_reviews(null, current_setting('tt.review')::uuid)), 1, 'admin_reviews() giver anmeldelsen');
select tt.ok((select count(*) from public.admin_reviews()) >= 1, 'admin_reviews() uden filter giver anmeldelser');
select tt.eq((select count(*)::int from public.admin_reviews('approved', current_setting('tt.review')::uuid)), 1, 'filter på status (godkendt)');
select tt.eq((select count(*)::int from public.admin_reviews('pending', current_setting('tt.review')::uuid)), 0, 'filter på status (afventer)');
select tt.eq((select r.clinic_name from public.admin_reviews(null, current_setting('tt.review')::uuid) r), (select name from public.clinics where id = tt.cid('X')), 'filter på id og klinikkens navn');
select tt.eq((select to_jsonb(r) ? 'patient_id' or to_jsonb(r) ? 'booking_id' from public.admin_reviews(null, current_setting('tt.review')::uuid) r), false, 'admin_reviews() har hverken patient_id eller booking_id');
select tt.eq((select count(*)::int from public.admin_review_replies(null, current_setting('tt.reply')::uuid)), 1, 'admin_review_replies() giver svaret');
select tt.eq((select r.review_text from public.admin_review_replies(null, current_setting('tt.reply')::uuid) r), 'Fin behandling og klar kommunikation om prisen.', 'svaret følger anmeldelsens tekst');
select tt.eq((select to_jsonb(r) ? 'patient_id' or to_jsonb(r) ? 'booking_id' from public.admin_review_replies(null, current_setting('tt.reply')::uuid) r), false, 'admin_review_replies() har ingen patient- eller bookingreference');
select tt.eq((select count(*)::int from public.admin_clinic_owners(array[tt.cid('X'), tt.cid('I')])), 1, 'ejerens e-mail kun for klinikken med ejer');
select tt.eq((select owner_email from public.admin_clinic_owners(array[tt.cid('X')])), 'klinik-x@test.invalid', 'ejerens e-mail');
select tt.denied('select public.admin_clinic_owners((select array_agg(gen_random_uuid()) from generate_series(1, 201)))', 'højst 200 klinikker ad gangen', '22023');
-- Ikke-admin kan ikke kalde læsefunktionerne
select tt.as_user(tt.id('pA'));
select tt.denied('select * from public.admin_reviews()', 'patient kan ikke kalde admin_reviews()', '42501');
select tt.denied('select * from public.admin_review_replies()', 'patient kan ikke kalde admin_review_replies()', '42501');
select tt.denied(format('select * from public.admin_clinic_owners(array[%L::uuid])', tt.cid('X')), 'patient kan ikke kalde admin_clinic_owners()', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied('select * from public.admin_reviews()', 'klinik kan ikke kalde admin_reviews()', '42501');
select tt.denied('select * from public.admin_review_replies()', 'klinik kan ikke kalde admin_review_replies()', '42501');
select tt.denied(format('select * from public.admin_clinic_owners(array[%L::uuid])', tt.cid('X')), 'klinik kan ikke se andres e-mail', '42501');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied('select * from public.admin_reviews()', 'anonym kan ikke kalde admin_reviews()', '42501');
select tt.as_anon();
select tt.denied('select * from public.admin_reviews()', 'anon-rollen kan ikke kalde admin_reviews()', '42501');
select tt.denied('select * from public.admin_clinic_owners(array[gen_random_uuid()])', 'anon-rollen kan ikke kalde admin_clinic_owners()', '42501');
select tt.as_user(tt.id('admin'), true);
select tt.denied('select * from public.admin_reviews()', 'admin med anonym JWT afvises', '42501');
select tt.as_user(tt.id('admin'));

-- Admin kan stadig ikke læse patienternes eller leadenes data
select tt.rows('select 1 from public.cases', 0, 'admin ser ingen sager');
select tt.rows('select 1 from public.case_services', 0, 'admin ser ingen sagsydelser');
select tt.rows('select 1 from public.case_images', 0, 'admin ser ingen billeder');
select tt.rows('select 1 from public.ai_conversations', 0, 'admin ser ingen AI-samtaler');
select tt.rows('select 1 from public.ai_messages', 0, 'admin ser ingen AI-beskeder');
select tt.rows('select 1 from public.leads', 0, 'admin ser ingen leads');
select tt.rows('select 1 from public.bookings', 0, 'admin ser ingen bookinger');
select tt.rows('select 1 from public.messages', 0, 'admin ser ingen beskeder');
select tt.rows('select 1 from public.notification_outbox', 0, 'admin ser ikke outboxen');
select tt.rows('select 1 from public.push_tokens', 0, 'admin ser ingen push-tokens');
select tt.rows('select 1 from public.web_push_subscriptions', 0, 'admin ser ingen web push-abonnementer');
select tt.rows('select 1 from public.favorite_clinics', 0, 'admin ser ingen favoritter');
select tt.rows('select 1 from public.consents', 0, 'admin ser ingen samtykker');
select tt.rows('select 1 from public.patients', 0, 'admin ser ingen patientprofiler');
select tt.rows('select 1 from public.clinic_notification_settings', 0, 'admin ser ingen notifikationsindstillinger');
select tt.eq((select count(*)::int from public.clinic_leads()), 0, 'admin får ingen leads via clinic_leads()');
select tt.eq((select count(*)::int from public.patient_bookings()), 0, 'admin får ingen bookinger via patient_bookings()');
select tt.denied('select * from public.claim_notifications(10)', 'admin kan ikke hente notifikationer');

rollback;
