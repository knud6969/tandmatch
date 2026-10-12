-- Test 2: Klinik Z uden lead på S kan ikke læse S, S's ydelser, billeder (tabel, clinic_lead_images()) eller leads.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);

-- Kontrol: X (har lead) kan se billedet via funktionen
select tt.as_user(tt.id('uX'));
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 1, 'X ser billedet via clinic_lead_images()');
select tt.rows(format('select 1 from public.clinic_lead_detail(%L)', tt.lead('S', 'X')), 1, 'X ser sagen via clinic_lead_detail()');

-- Z
select tt.as_user(tt.id('uZ'));
select tt.rows(format('select 1 from public.cases where id = %L', tt.id('S')), 0, 'Z kan ikke læse S');
select tt.rows(format('select 1 from public.case_services where case_id = %L', tt.id('S')), 0, 'Z kan ikke læse S''s ydelser');
select tt.rows(format('select 1 from public.case_images where case_id = %L', tt.id('S')), 0, 'Z kan ikke læse S''s billeder (tabel)');
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 0, 'Z kan ikke læse S''s billeder via clinic_lead_images()');
select tt.rows(format('select 1 from public.clinic_lead_detail(%L)', tt.lead('S', 'X')), 0, 'Z kan ikke læse S via clinic_lead_detail()');
select tt.rows(format('select 1 from public.leads where case_id = %L', tt.id('S')), 0, 'Z kan ikke læse S''s leads');
select tt.rows('select 1 from public.clinic_leads()', 0, 'Z har ingen leads');
select tt.rows('select 1 from public.leads', 0, 'Z ser ingen leads overhovedet');
select tt.rows('select 1 from public.cases', 0, 'Z ser ingen sager overhovedet');
select tt.rows('select 1 from public.case_images', 0, 'Z ser ingen billeder overhovedet');
select tt.rows('select 1 from public.case_services', 0, 'Z ser ingen sagsydelser overhovedet');
select tt.denied(format('select public.clinic_decide_lead(%L, %L, %L)', tt.lead('S', 'X'), 'accept', 'x'), 'Z kan ikke acceptere X''s lead', 'NOT_FOUND');

rollback;
