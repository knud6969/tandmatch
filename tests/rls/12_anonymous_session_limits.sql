-- Test 12: Anonym session kan ikke: kalde send_leads, give health_data_sharing, oprette en anden kladde,
-- skrive beskeder eller anmeldelser, booke.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- pA har et accepteret lead og en gennemført booking. Hendes JWT markeres som anonym nedenfor (is_anonymous = true).
select tt.mk_case('pA', 'S_acc');
select tt.mk_case('pA', 'S_done');
select tt.mk_lead('S_acc', 'X', 'accepted');
select tt.mk_booking(tt.mk_lead('S_done', 'X', 'booked'), 'undersoegelse', now() - interval '4 days');

-- Ægte anonym bruger (pAnon)
select tt.as_user(tt.id('pAnon'), true);
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('SAnon'), tt.cid('X')), 'anonym kan ikke kalde send_leads', 'ACCOUNT_REQUIRED');
select tt.denied(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, true)',
                        tt.id('pAnon'), 'health_data_sharing', 'health_data_sharing@v1-klinikker'), 'anonym kan ikke give health_data_sharing');
select tt.denied(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, false)',
                        tt.id('pAnon'), 'health_data_sharing', 'health_data_sharing@v1-klinikker'), 'anonym kan ikke give health_data_sharing (falsk markering)');
select tt.denied(format('insert into public.cases (patient_id) values (%L)', tt.id('pAnon')), 'anonym kan ikke oprette en anden kladde', 'DRAFT_LIMIT');
select tt.denied(format('insert into public.cases (patient_id, is_emergency) values (%L, true)', tt.id('pAnon')), 'anonym kan ikke oprette en akut sag', 'ACCOUNT_REQUIRED');
select tt.allowed(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, true)',
                         tt.id('pAnon'), 'ai_processing', 'ai_processing@v0-prototype'), 'anonym kan give ai_processing (kontrol)');

-- JWT markeret som anonym for en bruger, der ellers har leads og bookinger
select tt.as_user(tt.id('pA'), true);
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S_acc', 'X'), tt.id('pA'), 'Hej'),
                 'anonym session kan ikke skrive beskeder');
select tt.denied(format('insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy) values (%L, %L, 5, %L, %L)',
                        tt.booking(tt.lead('S_done', 'X')), tt.id('pA'), 'Fin behandling og klar kommunikation om prisen.', 'as_quoted'),
                 'anonym session kan ikke skrive anmeldelser');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                 'anonym session kan ikke booke', 'ACCOUNT_REQUIRED');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('Y')), 'anonym session kan ikke sende leads', 'ACCOUNT_REQUIRED');
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S_acc', 'X')), 'anonym session kan ikke trække leads tilbage', 'ACCOUNT_REQUIRED');

-- Kontrol: samme bruger med permanent JWT kan skrive og booke (så afvisningerne ovenfor skyldes anonymiteten)
select tt.as_user(tt.id('pA'), false);
select tt.allowed(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S_acc', 'X'), tt.id('pA'), 'Hej'), 'permanent kan skrive (kontrol)');
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'), 'permanent kan booke (kontrol)');

rollback;
