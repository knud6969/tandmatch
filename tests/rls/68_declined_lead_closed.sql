-- Test 68 (security H2, features/leads/README.md 4.4, 5.5, 5.7; migration 20261110000100):
--  * En klinik, der har afvist et lead (også clinic_left), ser kun metadata og sit eget svar: ingen opsummering, ydelser,
--    billedbeskrivelser, billeder, område, priser, beskeder eller beskedbilleder, og kan ikke skrive i tråden.
--  * Patienten ser stadig alt; en anden klinik på en anden sag er uberørt.
--  * Delingssamtykket: et lead med booket tid (booked) beholder indholdet efter tilbagetrækning; aflyses tiden, lukkes indholdet
--    (læsetids-værnet), og et nyt samtykke åbner det igen.
--  * lead_content_open() giver false for withdrawn og declined og true for sent, accepted og booked med samtykke.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'D1', p_image => true);
select tt.mk_case('pA', 'D2', p_image => true);
select tt.mk_case('pA', 'D3', p_image => true);
select tt.mk_case('pB', 'DB', p_image => true);
select tt.mk_lead('D1', 'X', 'sent');
select tt.mk_lead('D2', 'X', 'sent');
select tt.mk_lead('D3', 'X', 'accepted');
select tt.mk_lead('DB', 'X', 'sent');
select tt.mk_lead('D1', 'Y', 'sent');

-- Beskeder og beskedbilleder på D1 (X) og D2 (X)
select tt.as_user(tt.id('pA'));
insert into public.messages (id, lead_id, sender_id, body) values
  (tt.id('d1m'), tt.lead('D1', 'X'), tt.id('pA'), 'Besked på D1'),
  (tt.id('d2m'), tt.lead('D2', 'X'), tt.id('pA'), 'Besked på D2'),
  (tt.id('d3m'), tt.lead('D3', 'X'), tt.id('pA'), 'Besked på D3');
select tt.as_postgres();
insert into public.message_images (id, message_id, lead_id, position, consent_id, storage_path, width, height, bytes)
select tt.id('mi_' || n), tt.id(m), tt.lead(n, 'X'), 0, tt.consent('pA', 'image_upload'),
       'messages/' || tt.lead(n, 'X') || '/' || tt.id('mi_' || n) || '.jpg', 10, 10, 100
  from (values ('D1', 'd1m'), ('D2', 'd2m'), ('D3', 'd3m')) v(n, m);

-- Før afvisningen ser X indholdet
select tt.as_user(tt.id('uX'));
select tt.ok((select summary_text is not null and content_open from public.clinic_lead_detail(tt.lead('D1', 'X'))), 'før: X ser opsummeringen');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('D1', 'X')))::int, 1, 'før: X ser billedet');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('D1', 'X')))::int, 1, 'før: X ser beskeden');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('D1', 'X')))::int, 1, 'før: X ser beskedbilledet');
select tt.eq((select image_count from public.clinic_lead_detail(tt.lead('D1', 'X'))), 1, 'før: X ser billedantallet');

-- X afviser D1
select public.clinic_decide_lead(tt.lead('D1', 'X'), 'decline', null, null, null, 'no_capacity', 'Ingen tid i år');

-- Detaljen: kun metadata og eget svar
select tt.eq((select status::text from public.clinic_lead_detail(tt.lead('D1', 'X'))), 'declined', 'efter: status er declined');
select tt.eq((select content_open from public.clinic_lead_detail(tt.lead('D1', 'X'))), false, 'efter: content_open er false');
select tt.eq((select summary_text from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::text, 'efter: ingen opsummering');
select tt.eq((select summary_ai_assisted from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::boolean, 'efter: intet AI-flag');
select tt.eq((select services from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::jsonb, 'efter: ingen ydelser');
select tt.eq((select postal_code from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::text, 'efter: intet område');
select tt.eq((select image_count from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::int, 'efter: intet billedantal');
select tt.eq((select list_price_min from public.clinic_lead_detail(tt.lead('D1', 'X'))), null::int, 'efter: ingen listepris');
select tt.eq((select unread_messages from public.clinic_lead_detail(tt.lead('D1', 'X'))), 0, 'efter: ingen ulæste beskeder');
select tt.eq((select decline_reason::text from public.clinic_lead_detail(tt.lead('D1', 'X'))), 'no_capacity', 'efter: eget svar (grund) bevares');
select tt.eq((select decline_note from public.clinic_lead_detail(tt.lead('D1', 'X'))), 'Ingen tid i år', 'efter: eget svar (note) bevares');
select tt.ok((select responded_at is not null and seen_at is not null from public.clinic_lead_detail(tt.lead('D1', 'X'))), 'efter: svartidspunkt bevares');

-- Listen
select tt.eq((select content_open from public.clinic_leads() where lead_id = tt.lead('D1', 'X')), false, 'liste: content_open er false');
select tt.eq((select service_names from public.clinic_leads() where lead_id = tt.lead('D1', 'X')), null::text[], 'liste: ingen ydelser');
select tt.eq((select summary_excerpt from public.clinic_leads() where lead_id = tt.lead('D1', 'X')), null::text, 'liste: intet uddrag');
select tt.eq((select image_count from public.clinic_leads() where lead_id = tt.lead('D1', 'X')), null::int, 'liste: intet billedantal');
select tt.eq((select status::text from public.clinic_leads() where lead_id = tt.lead('D1', 'X')), 'declined', 'liste: status er stadig synlig');
select tt.eq((select content_open from public.clinic_leads() where lead_id = tt.lead('D2', 'X')), true, 'liste: det ubesvarede lead er åbent');

-- Billeder, beskeder og beskedbilleder
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('D1', 'X')))::int, 0, 'efter: ingen billeder');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('D1', 'X')))::int, 0, 'efter: ingen beskeder');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('D1', 'X')))::int, 0, 'efter: ingen beskedbilleder');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('D1', 'X'), tt.id('uX'), 'Efter afvisning'),
                 'efter: X kan ikke skrive i tråden');
select tt.as_postgres();
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('D1', 'X'))::int, 1, 'beskeden findes stadig (patienten)');
select tt.as_user(tt.id('uX'));
select public.clinic_mark_messages_read(tt.lead('D1', 'X'));
select tt.as_postgres();
select tt.ok((select read_at is null from public.messages where id = tt.id('d1m')), 'efter: X kan ikke markere beskeder som læst');

-- Uberørt: de øvrige leads
select tt.as_user(tt.id('uX'));
select tt.ok((select summary_text is not null from public.clinic_lead_detail(tt.lead('D2', 'X'))), 'D2 (sent) er uændret');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('D2', 'X')))::int, 1, 'D2: beskedbillede');
select tt.ok((select summary_text is not null from public.clinic_lead_detail(tt.lead('DB', 'X'))), 'en anden patients lead er uændret');
select tt.as_user(tt.id('uY'));
select tt.ok((select summary_text is not null and content_open from public.clinic_lead_detail(tt.lead('D1', 'Y'))), 'klinik Y ser sit eget lead på samme sag');
select tt.eq((select count(*) from public.clinic_lead_detail(tt.lead('D1', 'X')))::int, 0, 'klinik Y ser intet af X''s lead');

-- Patienten ser stadig alt
select tt.as_user(tt.id('pA'));
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('D1', 'X'))::int, 1, 'patienten ser sin besked');
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('D1', 'X'))::int, 1, 'patienten ser sit beskedbillede');

-- clinic_left (systemets afvisning)
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set status = 'declined', decline_reason = 'clinic_left', responded_at = now() where id = tt.lead('D2', 'X');
alter table public.leads enable trigger leads_before_update;
select tt.as_user(tt.id('uX'));
select tt.eq((select content_open from public.clinic_lead_detail(tt.lead('D2', 'X'))), false, 'clinic_left: indholdet er lukket');
select tt.eq((select summary_text from public.clinic_lead_detail(tt.lead('D2', 'X'))), null::text, 'clinic_left: ingen opsummering');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('D2', 'X')))::int, 0, 'clinic_left: ingen billeder');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('D2', 'X')))::int, 0, 'clinic_left: ingen beskeder');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('D2', 'X')))::int, 0, 'clinic_left: ingen beskedbilleder');
select tt.eq((select decline_reason::text from public.clinic_lead_detail(tt.lead('D2', 'X'))), 'clinic_left', 'clinic_left: grunden er synlig');

-- lead_content_open()
select tt.as_postgres();
select tt.eq(public.lead_content_open(tt.lead('D1', 'X')), false, 'declined: lukket');
select tt.eq(public.lead_content_open(tt.lead('D3', 'X')), true, 'accepted med samtykke: åbent');
select tt.eq(public.lead_content_open(tt.lead('DB', 'X')), true, 'sent med samtykke: åbent');
select tt.eq(public.lead_content_open(gen_random_uuid()), false, 'ukendt lead: lukket');

-- Delingssamtykket trækkes tilbage: leads uden booket tid lukkes, booket tid består
select tt.mk_case('pA', 'D4', p_image => true);
select tt.mk_booking(tt.mk_lead('D4', 'X', 'booked'), 'undersoegelse', tt.slot(5, 10), 'booked');
select tt.as_user(tt.id('pA'));
select public.withdraw_consent(tt.consent('pA', 'health_data_sharing'));
select tt.as_user(tt.id('uX'));
select tt.eq((select status::text from public.clinic_lead_detail(tt.lead('D3', 'X'))), 'withdrawn', 'efter tilbagetrækning: accepted uden booking er withdrawn');
select tt.eq((select content_open from public.clinic_lead_detail(tt.lead('D3', 'X'))), false, 'efter tilbagetrækning: indholdet er lukket');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('D3', 'X')))::int, 0, 'efter tilbagetrækning: ingen beskedbilleder');
select tt.ok((select summary_text is not null and content_open from public.clinic_lead_detail(tt.lead('D4', 'X'))), 'booket tid: indholdet består (eksisterende regel)');
select tt.ok((select booking_status = 'booked' and contact_name is not null from public.clinic_lead_detail(tt.lead('D4', 'X'))), 'booket tid: kontaktfelterne består');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('D4', 'X')))::int, 1, 'booket tid: billederne består');

-- Patienten aflyser tiden: leadet er accepted, og indholdet er lukket, mens samtykket er trukket tilbage
select tt.as_user(tt.id('pA'));
select public.cancel_booking(tt.booking(tt.lead('D4', 'X')));
select tt.as_user(tt.id('uX'));
select tt.eq((select status::text from public.clinic_lead_detail(tt.lead('D4', 'X'))), 'accepted', 'aflyst tid: leadet er accepted');
select tt.eq((select content_open from public.clinic_lead_detail(tt.lead('D4', 'X'))), false, 'aflyst tid uden samtykke: indholdet er lukket');
select tt.eq((select summary_text from public.clinic_lead_detail(tt.lead('D4', 'X'))), null::text, 'aflyst tid uden samtykke: ingen opsummering');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('D4', 'X')))::int, 0, 'aflyst tid uden samtykke: ingen billeder');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('D4', 'X'), tt.id('uX'), 'Hej'), 'aflyst tid uden samtykke: X kan ikke skrive');

-- Nyt samtykke åbner det igen
select tt.as_postgres();
insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
values (tt.id('pA'), 'health_data_sharing', 'health_data_sharing@v1-klinikker', false);
select tt.as_user(tt.id('uX'));
select tt.eq((select content_open from public.clinic_lead_detail(tt.lead('D4', 'X'))), true, 'nyt samtykke: indholdet er åbent igen');

rollback;
