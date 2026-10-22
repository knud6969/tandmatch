-- Test 5: Klinikken får contact_* = null fra clinic_lead_detail()/clinic_bookings() for et lead uden booking, en held-akuttid,
-- et lead med aflyst booking og et lead med no_show; udfyldt for booked og (effektivt) completed. patient_id returneres aldrig.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- En sag pr. scenarie (hos klinik X), alle ejet af pA
select tt.mk_case('pA', 'C_none');
select tt.mk_case('pA', 'C_held');
select tt.mk_case('pA', 'C_cancelled');
select tt.mk_case('pA', 'C_noshow');
select tt.mk_case('pA', 'C_booked');
select tt.mk_case('pA', 'C_eff_completed');
select tt.mk_case('pA', 'C_completed');
select tt.mk_lead('C_none', 'X', 'sent');
select tt.mk_booking(tt.mk_lead('C_held', 'X', 'sent'), 'akut_konsultation', tt.slot(3, 18), 'held');
select tt.mk_booking(tt.mk_lead('C_cancelled', 'X', 'accepted'), 'undersoegelse', tt.slot(4, 10), 'cancelled');
select tt.mk_booking(tt.mk_lead('C_noshow', 'X', 'booked'), 'undersoegelse', now() - interval '5 hours', 'no_show');
select tt.mk_booking(tt.mk_lead('C_booked', 'X', 'booked'), 'undersoegelse', tt.slot(5, 10), 'booked');
-- db-status 'booked', men sluttid for over 24 timer siden: effektivt completed
select tt.mk_booking(tt.mk_lead('C_eff_completed', 'X', 'booked'), 'undersoegelse', now() - interval '3 days', 'booked');
select tt.mk_booking(tt.mk_lead('C_completed', 'X', 'booked'), 'undersoegelse', now() - interval '6 days', 'completed');

select tt.as_user(tt.id('uX'));

-- clinic_lead_detail()
select tt.eq((select d.contact_name from public.clinic_lead_detail(tt.lead('C_none', 'X')) d), null::text, 'lead uden booking: contact_name null');
select tt.eq((select d.booking_id from public.clinic_lead_detail(tt.lead('C_none', 'X')) d), null::uuid, 'lead uden booking: ingen booking');
select tt.eq((select d.booking_status::text from public.clinic_lead_detail(tt.lead('C_held', 'X')) d), 'held', 'held-akuttid vises som held');
select tt.eq((select d.contact_name || d.contact_phone || d.contact_email from public.clinic_lead_detail(tt.lead('C_held', 'X')) d), null::text, 'held: contact_* er null');
select tt.eq((select d.booking_status::text from public.clinic_lead_detail(tt.lead('C_cancelled', 'X')) d), 'cancelled', 'aflyst booking vises som cancelled');
select tt.eq((select coalesce(d.contact_name, d.contact_phone, d.contact_email) from public.clinic_lead_detail(tt.lead('C_cancelled', 'X')) d), null::text, 'cancelled: contact_* er null');
select tt.eq((select d.booking_status::text from public.clinic_lead_detail(tt.lead('C_noshow', 'X')) d), 'no_show', 'no_show vises');
select tt.eq((select coalesce(d.contact_name, d.contact_phone, d.contact_email) from public.clinic_lead_detail(tt.lead('C_noshow', 'X')) d), null::text, 'no_show: contact_* er null');
select tt.eq((select d.contact_name from public.clinic_lead_detail(tt.lead('C_booked', 'X')) d), 'Alma Test', 'booked: contact_name udfyldt');
select tt.eq((select d.contact_phone from public.clinic_lead_detail(tt.lead('C_booked', 'X')) d), '+45 12 34 56 78', 'booked: contact_phone udfyldt');
select tt.eq((select d.contact_email from public.clinic_lead_detail(tt.lead('C_booked', 'X')) d), 'alma@test.invalid', 'booked: contact_email udfyldt');
select tt.eq((select d.booking_status::text from public.clinic_lead_detail(tt.lead('C_eff_completed', 'X')) d), 'completed', 'effektivt completed vises som completed');
select tt.eq((select d.contact_name from public.clinic_lead_detail(tt.lead('C_eff_completed', 'X')) d), 'Alma Test', 'effektivt completed: contact_* udfyldt');
select tt.eq((select d.contact_name from public.clinic_lead_detail(tt.lead('C_completed', 'X')) d), 'Alma Test', 'completed: contact_* udfyldt');

-- clinic_bookings()
create temp table cb as select * from public.clinic_bookings(now() - interval '30 days', now() + interval '30 days');
select tt.eq((select count(*) from cb)::int, 6, 'clinic_bookings() viser de 6 bookinger (ikke leadet uden booking)');
select tt.eq((select count(*) from cb where status in ('booked', 'completed') and contact_name is not null and contact_phone is not null and contact_email is not null)::int, 3,
             'clinic_bookings(): booked og completed har kontaktoplysninger');
select tt.eq((select count(*) from cb where status in ('held', 'cancelled', 'no_show') and (contact_name is not null or contact_phone is not null or contact_email is not null))::int, 0,
             'clinic_bookings(): held, cancelled og no_show har ingen kontaktoplysninger');
select tt.eq((select count(*) from cb where status = 'held')::int, 1, 'clinic_bookings(): én held');
select tt.eq((select count(*) from cb where status = 'completed')::int, 2, 'clinic_bookings(): effektivt completed medregnes');

-- patient_id i hverken kolonner eller indhold
select tt.ok(not tt.fn_returns_column('public.clinic_lead_detail(uuid)', 'patient_id'), 'clinic_lead_detail() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.clinic_bookings(timestamptz, timestamptz)', 'patient_id'), 'clinic_bookings() har ingen patient_id');
select tt.ok(position(tt.id('pA')::text in coalesce((select jsonb_agg(b)::text from cb b), '')) = 0, 'clinic_bookings() indeholder ikke patientens id');
select tt.ok(position(tt.id('pA')::text in coalesce((select jsonb_agg(d)::text from public.clinic_lead_detail(tt.lead('C_booked', 'X')) d), '')) = 0, 'clinic_lead_detail() indeholder ikke patientens id');

rollback;
