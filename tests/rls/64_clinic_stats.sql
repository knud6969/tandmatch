-- Test 64 (RLS-punkt 59; features/clinics/README.md 10.18; migration 20261107000100_clinic_stats):
--  * clinic_stats() giver kun den kaldende klinikejers egne tal (ingen klinik-id som parameter): Y får aldrig X's.
--  * Tæller kun leads fra owner_since og bookinger på dem; periode, definitioner, flyttede tider og held.
--  * En ikke-verificeret klinik, patient, anonym, admin og anon-rollen afvises; periode over 366 dage afvises.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'S2');
select tt.mk_case('pC', 'SC');
select tt.mk_case('pA', 'W1');
select tt.mk_case('pB', 'SB2');
select tt.mk_case('pA', 'BK1');
select tt.mk_case('pA', 'BK2');
select tt.mk_case('pA', 'BK3');
select tt.mk_case('pA', 'BK4');
select tt.mk_case('pA', 'BK5');
select tt.mk_case('pA', 'SY');

-- Leads (som postgres). Tidspunkter flyttes bagud uden om triggerne, som rulles tilbage med transaktionen.
select tt.mk_lead('S', 'X', 'accepted');
select tt.mk_lead('SB', 'X', 'declined');
select tt.mk_lead('SC', 'X', 'sent');
select tt.mk_lead('W1', 'X', 'withdrawn');
select tt.mk_lead('SB2', 'X', 'accepted');
select tt.mk_lead(c, 'X', 'booked') from unnest(array['BK1', 'BK2', 'BK3', 'BK4', 'BK5']) c;
select tt.mk_lead('SY', 'Y', 'accepted');
select tt.mk_lead('S2', 'R', 'sent') where false;

alter table public.leads disable trigger leads_before_update;
alter table public.clinics disable trigger clinics_guard;
update public.clinics set owner_since = now() - interval '200 days' where id in (tt.cid('X'), tt.cid('Y'));
update public.leads set sent_at = now() - interval '5 days' where clinic_id in (tt.cid('X'), tt.cid('Y'));
update public.leads set sent_at = now() - interval '60 days' where id = tt.lead('SB2', 'X');
update public.leads set responded_at = sent_at + interval '1 hour' where responded_at is not null;
update public.leads set responded_at = sent_at + interval '2 hours' where id = tt.lead('S', 'X');
update public.leads set responded_at = sent_at + interval '30 hours' where id = tt.lead('SB', 'X');
alter table public.leads enable trigger leads_before_update;
alter table public.clinics enable trigger clinics_guard;

-- Bookinger på X: completed, booked (flyttet fra en aflyst), no_show, aflyst af patient, aflyst af klinik, held.
select tt.mk_booking(tt.lead('BK1', 'X'), 'undersoegelse', now() - interval '3 days', 'completed');
select tt.mk_booking(tt.lead('BK3', 'X'), 'undersoegelse', now() - interval '8 days', 'no_show');
select tt.mk_booking(tt.lead('BK4', 'X'), 'undersoegelse', now() - interval '6 days', 'cancelled');
select tt.mk_booking(tt.lead('BK5', 'X'), 'undersoegelse', now() - interval '7 days', 'cancelled');
update public.bookings set cancelled_by = 'clinic' where lead_id = tt.lead('BK5', 'X');
select tt.mk_booking(tt.lead('BK2', 'X'), 'undersoegelse', now() - interval '2 days', 'cancelled');
select tt.mk_booking(tt.lead('BK2', 'X'), 'undersoegelse', now() + interval '4 days', 'booked');
update public.bookings set rescheduled_from_id = (select id from public.bookings where lead_id = tt.lead('BK2', 'X') and status = 'cancelled')
 where lead_id = tt.lead('BK2', 'X') and status = 'booked';
select tt.mk_booking(tt.lead('S', 'X'), 'undersoegelse', now() + interval '6 days', 'held');
-- Y har sin egen booking, som X aldrig må se.
select tt.mk_booking(tt.lead('SY', 'Y'), 'undersoegelse', now() + interval '2 days', 'booked');

select tt.as_user(tt.id('uX'));
select tt.eq((select leads_total from public.clinic_stats(now() - interval '30 days', now())), 9, 'X: 9 leads de seneste 30 dage');
select tt.eq((select leads_pending from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 afventer');
select tt.eq((select leads_accepted from public.clinic_stats(now() - interval '30 days', now())), 6, 'X: 6 accepteret');
select tt.eq((select leads_declined from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 afvist');
select tt.eq((select leads_withdrawn_unanswered from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 tilbagetrukket ubesvaret');
select tt.eq((select leads_emergency from public.clinic_stats(now() - interval '30 days', now())), 0, 'X: ingen akutte');
select tt.eq((select answered_within_24h from public.clinic_stats(now() - interval '30 days', now())), 6, 'X: 6 besvaret inden for 24 timer');
select tt.eq((select median_response_minutes from public.clinic_stats(now() - interval '30 days', now())), 60::float8, 'X: median 60 min');
select tt.eq((select leads_with_booking from public.clinic_stats(now() - interval '30 days', now())), 3, 'X: 3 leads med booking');
select tt.eq((select bookings_upcoming from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 kommende (held tælles ikke)');
select tt.eq((select bookings_completed from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 gennemført');
select tt.eq((select bookings_no_show from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 udeblevet');
select tt.eq((select bookings_cancelled_by_patient from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 aflyst af patient (den flyttede tæller ikke)');
select tt.eq((select bookings_cancelled_by_clinic from public.clinic_stats(now() - interval '30 days', now())), 1, 'X: 1 aflyst af klinik');
select tt.eq((select leads_total from public.clinic_stats(now() - interval '90 days', now())), 10, 'X: 10 leads på 90 dage');
select tt.eq((select leads_total from public.clinic_stats(now() - interval '2 days', now())), 0, 'X: ingen leads de seneste 2 dage');
select tt.eq((select median_response_minutes from public.clinic_stats(now() - interval '2 days', now())), null::float8, 'X: ingen median uden besvarede');
select tt.eq((select count(*) from public.clinic_stats(now() - interval '30 days', now()))::int, 1, 'præcis én række');

select tt.as_user(tt.id('uY'));
select tt.eq((select leads_total from public.clinic_stats(now() - interval '30 days', now())), 1, 'Y ser kun sit eget lead');
select tt.eq((select bookings_upcoming from public.clinic_stats(now() - interval '30 days', now())), 1, 'Y ser kun sin egen booking');
select tt.eq((select bookings_completed from public.clinic_stats(now() - interval '30 days', now())), 0, 'Y ser ikke X''s bookinger');

-- Ejer, der overtog klinikken efter leadet, ser det ikke (sent_at < owner_since).
select tt.as_postgres();
alter table public.clinics disable trigger clinics_guard;
update public.clinics set owner_since = now() - interval '1 day' where id = tt.cid('Y');
alter table public.clinics enable trigger clinics_guard;
select tt.as_user(tt.id('uY'));
select tt.eq((select leads_total from public.clinic_stats(now() - interval '30 days', now())), 0, 'Y: lead fra før owner_since tælles ikke');

-- Afvisninger
select tt.denied('select * from public.clinic_stats(now() - interval ''400 days'', now())', 'over 366 dage afvises', '22023') ;
select tt.as_user(tt.id('uX'));
select tt.denied('select * from public.clinic_stats(now() - interval ''400 days'', now())', 'over 366 dage afvises', '22023');
select tt.denied('select * from public.clinic_stats(now(), now() - interval ''1 day'')', 'omvendt periode afvises', '22023');
select tt.denied('select * from public.clinic_stats(null, now())', 'null afvises', '22023');
select tt.as_user(tt.id('uR'));
select tt.denied('select * from public.clinic_stats(now() - interval ''30 days'', now())', 'registered klinik afvises', 'CLINIC_NOT_VERIFIED');
select tt.as_user(tt.id('pA'));
select tt.denied('select * from public.clinic_stats(now() - interval ''30 days'', now())', 'patient afvises', 'CLINIC_NOT_VERIFIED');
select tt.as_user(tt.id('pAnon'), true);
select tt.denied('select * from public.clinic_stats(now() - interval ''30 days'', now())', 'anonym afvises', 'CLINIC_NOT_VERIFIED');
select tt.as_postgres();
select tt.mk_admin();
select tt.as_user(tt.id('admin'));
select tt.denied('select * from public.clinic_stats(now() - interval ''30 days'', now())', 'admin afvises', 'CLINIC_NOT_VERIFIED');
select tt.as_anon();
select tt.denied('select * from public.clinic_stats(now() - interval ''30 days'', now())', 'anon-rollen afvises', '42501');

rollback;
