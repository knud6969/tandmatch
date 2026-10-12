-- Test 22: close_case(): kun ejeren; sent- og ubookede accepted-leads bliver withdrawn, held frigives, booked består;
-- en lukket sag kan ikke få nye leads.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'C1');
select tt.mk_case('pA', 'C2');
-- C1: sent, sent med held akuttid, booked (fremtidig). C2: accepted uden booking.
select tt.mk_lead('C1', 'X', 'sent');
select tt.mk_booking(tt.mk_lead('C1', 'Y', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held');
select tt.mk_booking(tt.mk_lead('C1', 'Z', 'booked'), 'undersoegelse', tt.slot(4, 10), 'booked');
select tt.mk_lead('C2', 'W', 'accepted');

-- Andre end ejeren
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.close_case(%L)', tt.id('C1')), 'anden patient kan ikke lukke sagen', 'NOT_FOUND');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.close_case(%L)', tt.id('C1')), 'klinik kan ikke lukke sagen', 'NOT_FOUND');
select tt.as_anon();
select tt.denied(format('select public.close_case(%L)', tt.id('C1')), 'anon kan ikke lukke sagen');
select tt.as_postgres();
select tt.eq((select status::text from public.cases where id = tt.id('C1')), 'submitted', 'sagen er stadig åben efter afviste kald');

-- Ejeren lukker C1
select tt.as_user(tt.id('pA'));
select public.close_case(tt.id('C1'));
select public.close_case(tt.id('C1'));   -- idempotent
select tt.as_postgres();
select tt.eq((select status::text from public.cases where id = tt.id('C1')), 'closed', 'sagen er lukket');
select tt.ok((select closed_at is not null from public.cases where id = tt.id('C1')), 'closed_at er sat');
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'X')), 'withdrawn', 'sent lead er withdrawn');
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'Y')), 'withdrawn', 'sent lead med held-tid er withdrawn');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('C1', 'Y')), 'cancelled', 'held-reservationen er frigivet');
select tt.eq((select cancelled_by::text from public.bookings where lead_id = tt.lead('C1', 'Y')), 'patient', 'cancelled_by = patient');
select tt.eq((select status::text from public.leads where id = tt.lead('C1', 'Z')), 'booked', 'booked lead består');
select tt.eq((select status::text from public.bookings where lead_id = tt.lead('C1', 'Z')), 'booked', 'booked booking består');

-- Klinikkerne mister adgangen til de tilbagetrukne
select tt.as_user(tt.id('uX'));
select tt.eq((select d.summary_text from public.clinic_lead_detail(tt.lead('C1', 'X')) d), null::text, 'X mister sagens indhold');
select tt.as_user(tt.id('uZ'));
select tt.ok((select d.summary_text is not null from public.clinic_lead_detail(tt.lead('C1', 'Z')) d), 'Z (booket) beholder sagens indhold');

-- Lukket sag kan ikke få nye leads
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('C1'), tt.cid('V')), 'lukket sag kan ikke få nye leads', 'CASE_NOT_READY');
select tt.denied(format('insert into public.case_services (case_id, service_id) values (%L, %L)', tt.id('C1'), tt.svc('blegning')), 'lukket sag kan ikke ændres');
select tt.affects(format('update public.cases set postal_code = %L where id = %L', '2200', tt.id('C1')), 0, 'lukket sag kan ikke redigeres');

-- C2: accepted uden booking bliver withdrawn
select public.close_case(tt.id('C2'));
select tt.as_postgres();
select tt.eq((select status::text from public.leads where id = tt.lead('C2', 'W')), 'withdrawn', 'ubooket accepted lead er withdrawn');
select tt.ok((select withdrawn_at is not null from public.leads where id = tt.lead('C2', 'W')), 'withdrawn_at er sat');

rollback;
