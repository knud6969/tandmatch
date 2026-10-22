-- Test 19: withdraw_lead afvises for andre end sagens ejer og for leads, der ikke er sent; en held-akuttid frigives.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'S_e');
select tt.mk_case('pB', 'S_other');
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);
select public.send_leads(tt.id('S_e'), array[tt.cid('Z')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678');
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'accept');

-- Andre end ejeren
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S', 'X')), 'anden patient kan ikke trække tilbage', 'NOT_FOUND');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S', 'X')), 'klinikken kan ikke trække tilbage', 'NOT_FOUND');
select tt.as_anon();
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S', 'X')), 'anon kan ikke trække tilbage');
select tt.as_user(tt.id('pA'), true);
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S', 'X')), 'anonym session kan ikke trække tilbage', 'ACCOUNT_REQUIRED');

-- Kun sent
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S', 'Y')), 'accepted lead kan ikke trækkes tilbage', 'LEAD_NOT_PENDING');

-- Held-akuttid frigives
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e', 'Z')), 'held', 'opsætning: akuttiden er reserveret');
select tt.as_user(tt.id('pA'));
select public.withdraw_lead(tt.lead('S_e', 'Z'));
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('S_e', 'Z')), 'cancelled', 'tilbagetrækning aflyser reservationen');
select tt.eq((select b.cancelled_by::text from public.bookings b where b.lead_id = tt.lead('S_e', 'Z')), 'patient', 'cancelled_by = patient');
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('S_e', 'Z')), 'withdrawn', 'leadet er withdrawn');
-- Tiden kan nu bookes af en anden
select tt.mk_lead('S_other', 'Z', 'accepted');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_other', 'Z'), tt.svc('akut_konsultation'), tt.slot(3, 18), 'Bo Test', '+45 87654321'),
                  'den frigivne tid kan bookes af en anden');

-- Allerede tilbagetrukket
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.withdraw_lead(%L)', tt.lead('S_e', 'Z')), 'withdrawn lead kan ikke trækkes tilbage igen', 'LEAD_NOT_PENDING');
-- Ordinært sent lead kan trækkes tilbage, og pladsen i loftet på 3 frigives
select tt.allowed(format('select public.withdraw_lead(%L)', tt.lead('S', 'X')), 'ejeren kan trække et sent lead tilbage');
select tt.as_postgres();
select tt.eq((select l.withdrawn_at is not null from public.leads l where l.id = tt.lead('S', 'X')), true, 'withdrawn_at er sat');

rollback;
