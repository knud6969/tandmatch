-- Test 4: Ingen klinik kan læse ai_conversations, ai_messages, cases, case_images, bookings eller patients direkte.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept');
select tt.as_user(tt.id('pA'));
select public.book_slot(tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678');

-- Kontrol: X har lead og booking og ser dem kun via funktionerne
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.leads', 1, 'X ser sit lead');

select tt.rows('select 1 from public.ai_conversations', 0, 'ai_conversations er skjult for klinikker');
select tt.rows('select 1 from public.ai_messages', 0, 'ai_messages er skjult for klinikker');
select tt.rows('select 1 from public.cases', 0, 'cases er skjult for klinikker');
select tt.rows('select 1 from public.case_images', 0, 'case_images er skjult for klinikker');
select tt.rows('select 1 from public.bookings', 0, 'bookings er skjult for klinikker');
select tt.rows('select 1 from public.patients', 0, 'patients er skjult for klinikker');
select tt.rows('select 1 from public.case_services', 0, 'case_services er skjult for klinikker');
select tt.rows('select 1 from public.consents', 0, 'consents er skjult for klinikker');
select tt.rows('select 1 from public.terms_acceptances', 0, 'terms_acceptances er skjult for klinikker');
select tt.rows('select 1 from public.reviews', 0, 'reviews er skjult for klinikker (kun via clinic_reviews())');
select tt.rows(format('select 1 from public.profiles where id <> %L', tt.id('uX')), 0, 'andres profiler er skjult for klinikker');
select tt.rows('select 1 from public.ai_limits', 0, 'ai_limits er skjult');
select tt.rows('select 1 from public.rate_limits', 0, 'rate_limits er skjult');

-- Selv med præcist id
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('S')), 0, 'cases med kendt id er skjult');
select tt.rows(format('select 1 from public.patients where id = %L', tt.id('pA')), 0, 'patients med kendt id er skjult');
select tt.rows(format('select 1 from public.ai_conversations where case_id = %L', tt.id('S')), 0, 'ai_conversations med kendt sags-id er skjult');

-- Klinik-funktionerne udleverer hverken patient-id, case-id eller AI-chat
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)', 'patient_id'), 'clinic_leads() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_leads(public.lead_status)', 'case_id'), 'clinic_leads() har ingen case_id');
select tt.ok(not tt.fn_returns_column('public.clinic_lead_detail(uuid)', 'patient_id'), 'clinic_lead_detail() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_lead_detail(uuid)', 'case_id'), 'clinic_lead_detail() har ingen case_id');
select tt.ok(not tt.fn_returns_column('public.clinic_bookings(timestamptz, timestamptz)', 'patient_id'), 'clinic_bookings() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_lead_images(uuid)', 'patient_id'), 'clinic_lead_images() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_reviews()', 'patient_id'), 'clinic_reviews() har ingen patient_id');

-- Selve rækkerne fra funktionerne indeholder heller ikke patientens id
select tt.ok(position(tt.id('pA')::text in coalesce((select jsonb_agg(l)::text from public.clinic_leads() l), '')) = 0, 'clinic_leads() indeholder ikke patientens id');
select tt.ok(position(tt.id('pA')::text in coalesce((select jsonb_agg(d)::text from public.clinic_lead_detail(tt.lead('S', 'X')) d), '')) = 0, 'clinic_lead_detail() indeholder ikke patientens id');
select tt.ok(position(tt.id('pA')::text in coalesce((select jsonb_agg(b)::text from public.clinic_bookings(now() - interval '1 day', now() + interval '30 days') b), '')) = 0, 'clinic_bookings() indeholder ikke patientens id');

rollback;
