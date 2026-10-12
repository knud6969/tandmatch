-- Test 16: Billeder: upload og insert efter afsendelse afvises; uden aktivt image_upload afvises; efter tilbagetrækning
-- returnerer clinic_lead_images() intet.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Klienterne kan aldrig skrive billeder (kun serveren med service role)
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_x'), tt.id('S'), tt.id('pA'), tt.consent('pA', 'image_upload'), tt.id('S')::text || '/' || tt.id('img_x')::text || '.jpg'),
                 'patient kan ikke indsætte billede direkte', '42501');
select tt.denied(format('delete from public.case_images where case_id = %L', tt.id('S')), 'patient kan ikke slette billede direkte', '42501');
select tt.as_anon();
select tt.denied(format('insert into public.case_images (case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, 10, 10, 100)',
                        tt.id('S'), tt.id('pA'), tt.consent('pA', 'image_upload'), 'x.jpg'), 'anon kan ikke indsætte billede', '42501');

-- Service role (serveren) uden samtykke: afvises af databasen
select tt.as_service();
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_c'), tt.id('SB'), tt.id('pB'), tt.consent('pA', 'image_upload'), tt.id('SB')::text || '/' || tt.id('img_c')::text || '.jpg'),
                 'billede med en andens samtykke afvises', 'CONSENT_REQUIRED');
select tt.as_postgres();
select tt.mk_case('pC', 'S_pC', p_approve => false);   -- pC har ingen samtykker
select tt.as_service();
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_pc'), tt.id('S_pC'), tt.id('pC'), tt.consent('pA', 'image_upload'), tt.id('S_pC')::text || '/' || tt.id('img_pc')::text || '.jpg'),
                 'billede uden eget image_upload-samtykke afvises', 'CONSENT_REQUIRED');
-- Et samtykke uden AI-oplysning (en tekstversion uden ai_disclosure) kan ikke engang gives
select tt.as_postgres();
insert into public.consent_text_versions (type, text_version, ai_disclosure) values ('image_upload', 'image_upload@gammel-uden-ai', false);
insert into public.consents (patient_id, type, text_version) values (tt.id('pC'), 'image_upload', 'image_upload@gammel-uden-ai');
select tt.as_service();
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_pc'), tt.id('S_pC'), tt.id('pC'), tt.consent('pC', 'image_upload'), tt.id('S_pC')::text || '/' || tt.id('img_pc')::text || '.jpg'),
                 'billede med samtykketekst uden AI-oplysning afvises', 'CONSENT_REQUIRED');

-- Kontrol: med gyldigt samtykke lykkes en indsættelse på en kladde
select tt.as_service();
select tt.allowed(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                         tt.id('img_ok'), tt.id('SB'), tt.id('pB'), tt.consent('pB', 'image_upload'), tt.id('SB')::text || '/' || tt.id('img_ok')::text || '.jpg'),
                  'billede med gyldigt samtykke på kladde (kontrol)');

-- Efter afsendelse: sagen er ikke længere en kladde
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select tt.as_service();
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_late'), tt.id('S'), tt.id('pA'), tt.consent('pA', 'image_upload'), tt.id('S')::text || '/' || tt.id('img_late')::text || '.jpg'),
                 'billede efter afsendelse afvises', 'kladde');

-- Klinikken ser billedet, så længe samtykket er aktivt
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 1, 'klinikken ser billedet med aktivt samtykke');
select tt.eq((select count(*) from public.clinic_leads() where image_count = 1)::int, 1, 'clinic_leads() tæller billedet');

-- Tilbagetrækning af image_upload: billederne slettes, og klinikken mister dem
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select * from public.withdraw_consent(%L)', tt.consent('pA', 'image_upload')), 'patienten kan trække image_upload tilbage');
select tt.rows('select 1 from public.case_images', 0, 'billedrækkerne er slettet (også på sendt sag)');
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 0, 'clinic_lead_images() er tom efter tilbagetrækning');
select tt.eq((select image_count from public.clinic_lead_detail(tt.lead('S', 'X'))), 0, 'clinic_lead_detail() viser 0 billeder efter tilbagetrækning');

-- Selv hvis en række skulle ligge tilbage, skjuler funktionen billedet, når samtykket er trukket tilbage
select tt.as_postgres();
select tt.mk_case('pB', 'SB_late');
select tt.as_service();
select tt.allowed(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                         tt.id('img_late2'), tt.id('SB_late'), tt.id('pB'), tt.consent('pB', 'image_upload'), tt.id('SB_late')::text || '/' || tt.id('img_late2')::text || '.jpg'),
                  'opsætning: billede på ny kladde');
select tt.as_postgres();
select tt.mk_lead('SB_late', 'X', 'sent');
update public.consents set withdrawn_at = now() where id = tt.consent('pB', 'image_upload');
select tt.eq((select count(*) from public.case_images where case_id = tt.id('SB_late'))::int, 1, 'opsætning: rækken ligger stadig');
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('SB_late', 'X')), 0, 'clinic_lead_images() skjuler billede, når samtykket er trukket tilbage');

-- Nyt upload kræver nyt samtykke efter tilbagetrækning
select tt.as_service();
select tt.denied(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                        tt.id('img_late3'), tt.id('S_pC'), tt.id('pC'), tt.consent('pB', 'image_upload'), 'x'), 'trukket samtykke kan ikke bruges til nyt billede');

rollback;
