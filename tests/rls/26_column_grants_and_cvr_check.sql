-- Test 26: Kolonne-grants: authenticated kan ikke opdatere andre kolonner end dem i 5.1 regel 12 (fx cases.status,
-- clinics.status, messages.body), selv om RLS-policyen tillader rækken. public_* returnerer aldrig status registered.
-- is_cvr_claimed() returnerer kun boolean.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Rækker til at opdatere: en besked og en kommende lead
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'X'), tt.id('pA'), 'Hej X');

-- ---- clinics (ejeren X) ----
select tt.as_user(tt.id('uX'));
create function pg_temp.col_update(p_table text, p_col text, p_where text) returns text language sql as $$
  select format('update public.%I set %I = %I where %s', p_table, p_col, p_col, p_where)
$$;
-- tilladte kolonner (5.1 regel 12)
select tt.allowed(pg_temp.col_update('clinics', c, format('id = %L', tt.cid('X'))), 'clinics.' || c || ' må opdateres af ejeren')
  from unnest(array['name', 'description', 'address', 'postal_code', 'city', 'phone', 'email', 'website',
                    'trustpilot_url', 'trustpilot_score', 'trustpilot_review_count']) c;
-- forbudte kolonner
select tt.denied(pg_temp.col_update('clinics', c, format('id = %L', tt.cid('X'))), 'clinics.' || c || ' må ikke opdateres af ejeren', '42501')
  from unnest(array['id', 'owner_id', 'status', 'cvr', 'verified_at', 'import_source', 'lat', 'lng', 'logo_path', 'trustpilot_updated_at', 'trustpilot_entered_by', 'created_at', 'updated_at']) c;

-- ---- patients (pA) ----
select tt.as_user(tt.id('pA'));
select tt.allowed(pg_temp.col_update('patients', c, format('id = %L', tt.id('pA'))), 'patients.' || c || ' må opdateres')
  from unnest(array['first_name', 'postal_code', 'phone']) c;
select tt.denied(pg_temp.col_update('patients', c, format('id = %L', tt.id('pA'))), 'patients.' || c || ' må ikke opdateres', '42501')
  from unnest(array['id', 'created_at']) c;

-- ---- cases (pA, kladde) ----
select tt.allowed(pg_temp.col_update('cases', c, format('id = %L', tt.id('S_none'))), 'cases.' || c || ' må opdateres')
  from unnest(array['postal_code', 'preferred_timeframe']) c where false;   -- sagen S er sendt nedenfor; se næste blok
select tt.as_postgres();
select tt.mk_case('pA', 'S_draft', p_approve => false);
select tt.as_user(tt.id('pA'));
select tt.allowed(pg_temp.col_update('cases', c, format('id = %L', tt.id('S_draft'))), 'cases.' || c || ' må opdateres')
  from unnest(array['postal_code', 'preferred_timeframe']) c;
select tt.denied(pg_temp.col_update('cases', c, format('id = %L', tt.id('S_draft'))), 'cases.' || c || ' må ikke opdateres', '42501')
  from unnest(array['id', 'patient_id', 'status', 'is_emergency', 'ai_summary', 'ai_model', 'ai_prompt_version', 'ai_generation_count', 'summary_text',
                    'summary_ai_assisted', 'summary_approved_at', 'sharing_consent_id', 'submitted_at', 'closed_at', 'created_at', 'updated_at']) c;
select tt.denied(format('update public.cases set status = %L where id = %L', 'closed', tt.id('S_draft')), 'cases.status kan ikke sættes til closed direkte', '42501');
select tt.denied(format('update public.cases set status = %L where id = %L', 'submitted', tt.id('S_draft')), 'cases.status kan ikke sættes til submitted direkte', '42501');

-- ---- messages ----
select tt.denied(pg_temp.col_update('messages', c, format('lead_id = %L', tt.lead('S', 'X'))), 'messages.' || c || ' må ikke opdateres af afsenderen', '42501')
  from unnest(array['body', 'lead_id', 'sender_id', 'created_at', 'id']) c;
select tt.denied(format('update public.messages set body = %L where lead_id = %L', 'ændret', tt.lead('S', 'X')), 'messages.body kan ikke ændres', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied(format('update public.messages set body = %L where lead_id = %L', 'ændret af klinik', tt.lead('S', 'X')), 'messages.body kan ikke ændres af modtageren', '42501');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L', tt.lead('S', 'X')), 0, 'klinikken har ingen direkte UPDATE på messages');
select public.clinic_mark_messages_read(tt.lead('S', 'X'));
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where not m.from_me and m.read_at is not null)::int, 1, 'klinikken markerer patientens besked som læst via funktionen');

-- ---- portfolio_items ----
select tt.allowed(pg_temp.col_update('portfolio_items', c, format('clinic_id = %L', tt.cid('X'))), 'portfolio_items.' || c || ' må opdateres')
  from unnest(array['caption', 'service_id']) c;
select tt.denied(pg_temp.col_update('portfolio_items', c, format('clinic_id = %L', tt.cid('X'))), 'portfolio_items.' || c || ' må ikke opdateres', '42501')
  from unnest(array['clinic_id', 'dentist_id', 'image_path', 'patient_consent_confirmed_at', 'consent_text_version']) c;

-- ---- leads, bookings, reviews: ingen direkte skrivning overhovedet ----
select tt.denied(format('update public.leads set status = %L where id = %L', 'accepted', tt.lead('S', 'X')), 'klinik kan ikke sætte leads.status direkte', '42501');
select tt.denied(format('update public.leads set clinic_comment = %L where id = %L', 'x', tt.lead('S', 'X')), 'klinik kan ikke skrive leads direkte', '42501');
select tt.denied(format('insert into public.leads (case_id, clinic_id) values (%L, %L)', tt.id('SB'), tt.cid('X')), 'klinik kan ikke oprette leads', '42501');
select tt.as_user(tt.id('pA'));
select tt.denied(format('update public.leads set status = %L where id = %L', 'booked', tt.lead('S', 'X')), 'patient kan ikke sætte leads.status direkte', '42501');
select tt.denied(format('insert into public.leads (case_id, clinic_id) values (%L, %L)', tt.id('S'), tt.cid('Y')), 'patient kan ikke oprette leads direkte', '42501');
select tt.denied(format('insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, contact_name, contact_phone, contact_email) values (%L, %L, %L, %L, now() + interval %L, now() + interval %L, %L, %L, %L)',
                        tt.lead('S', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), '5 days', '5 days 30 minutes', 'Alma Test', '+45 12345678', 'a@test.invalid'),
                 'patient kan ikke oprette bookinger direkte', '42501');
select tt.denied('update public.bookings set status = ' || quote_literal('completed'), 'patient kan ikke sætte bookingstatus', '42501');
select tt.denied('update public.reviews set moderation_status = ' || quote_literal('approved'), 'patient kan ikke godkende egne anmeldelser', '42501');
select tt.denied('update public.clinics set status = ' || quote_literal('verified'), 'patient kan ikke opdatere klinikker', '42501');

-- ---- public_* returnerer aldrig status registered ----
select tt.as_anon();
select tt.eq((select count(*) from public.public_clinics() where status::text not in ('imported', 'verified'))::int, 0, 'public_clinics() returnerer kun imported/verified');
select tt.eq((select count(*) from public.public_clinics() where id = tt.cid('R') and status = 'imported')::int, 1, 'registered klinik vises som imported');
select tt.eq((select status::text from public.public_clinic_profile(tt.cid('R'))), 'imported', 'public_clinic_profile() maskerer registered');
select tt.eq((select count(*) from public.public_clinics(null, array[tt.cid('R')]) where status::text = 'registered')::int, 0, 'ingen registered ved opslag på id');
-- Samme for et verificeret → registered skift
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A6'), 'registered');
select tt.as_anon();
select tt.eq((select count(*) from public.public_clinics() where status::text = 'registered')::int, 0, 'ingen registered efter statusskift');

-- ---- is_cvr_claimed() ----
select tt.eq((select prorettype::regtype::text from pg_proc where oid = 'public.is_cvr_claimed(text)'::regprocedure), 'boolean', 'is_cvr_claimed() returnerer boolean');
select tt.eq((select proretset from pg_proc where oid = 'public.is_cvr_claimed(text)'::regprocedure), false, 'is_cvr_claimed() returnerer ikke en mængde');
select tt.eq(public.is_cvr_claimed('10000001'), true, 'verificeret klinik med ejer er claimed');
select tt.eq(public.is_cvr_claimed('10000012'), true, 'registered klinik med ejer er claimed');
select tt.eq(public.is_cvr_claimed('10000013'), false, 'importeret klinik uden ejer er ikke claimed');
select tt.eq(public.is_cvr_claimed('99999999'), false, 'ukendt CVR er ikke claimed');
select tt.eq(public.is_cvr_claimed(null), false, 'null er ikke claimed');
select tt.as_user(tt.id('pA'));
select tt.eq(public.is_cvr_claimed('10000001'), true, 'authenticated kan også kalde is_cvr_claimed()');

rollback;
