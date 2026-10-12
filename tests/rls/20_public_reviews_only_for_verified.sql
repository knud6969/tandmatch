-- Test 20: public_reviews() og public_clinic_review_stats_many() returnerer intet for imported/registered klinikker.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Godkendte anmeldelser hos X (verificeret), A5 (bliver importeret) og A6 (bliver registered)
create function pg_temp.mk_review(p_case text, p_clinic text, p_day int, p_stars int, p_accuracy public.price_accuracy, p_status public.moderation_status default 'approved')
returns uuid language plpgsql as $$
declare v_booking uuid; v_review uuid;
begin
  perform tt.mk_case('pA', p_case);
  v_booking := tt.mk_booking(tt.mk_lead(p_case, p_clinic, 'booked'), 'undersoegelse', now() - make_interval(days => p_day), 'completed');
  insert into public.reviews (booking_id, stars, text, price_accuracy) values (v_booking, p_stars, 'Fin behandling, og prisen passede fint.', p_accuracy) returning id into v_review;
  update public.reviews set moderation_status = p_status where id = v_review;
  return v_review;
end $$;

select pg_temp.mk_review('RX1', 'X', 11, 5, 'as_quoted');
select pg_temp.mk_review('RX2', 'X', 12, 4, 'slightly_higher');
select pg_temp.mk_review('RX3', 'X', 13, 3, 'much_higher');
select pg_temp.mk_review('RX4', 'X', 14, 1, 'much_higher', 'pending');
select pg_temp.mk_review('RX5', 'X', 15, 1, 'much_higher', 'rejected');
select pg_temp.mk_review('RA5', 'A5', 16, 5, 'as_quoted');
select pg_temp.mk_review('RA6', 'A6', 17, 5, 'as_quoted');
-- Et godkendt og et afventende svar hos X
insert into public.review_replies (review_id, text, moderation_status)
select r.id, 'Tak for din anmeldelse.', 'pending' from public.reviews r join public.bookings b on b.id = r.booking_id where b.lead_id = tt.lead('RX1', 'X');
update public.review_replies set moderation_status = 'approved' where text = 'Tak for din anmeldelse.';
insert into public.review_replies (review_id, text, moderation_status)
select r.id, 'Svar der afventer moderation.', 'pending' from public.reviews r join public.bookings b on b.id = r.booking_id where b.lead_id = tt.lead('RX2', 'X');

-- A5 mister sin ejer (bliver importeret); A6 mister verificeringen (bliver registered)
delete from auth.users where id = tt.id('uA5');
select public.admin_set_clinic_status(tt.cid('A6'), 'registered');
select tt.eq((select status::text from public.clinics where id = tt.cid('A5')), 'imported', 'opsætning: A5 er importeret');
select tt.eq((select status::text from public.clinics where id = tt.cid('A6')), 'registered', 'opsætning: A6 er registered');

select tt.as_anon();
-- Verificeret klinik: kun godkendte anmeldelser og godkendte svar
select tt.eq((select count(*) from public.public_reviews(tt.cid('X')))::int, 3, 'public_reviews(X): kun de 3 godkendte');
select tt.eq((select count(*) from public.public_reviews(tt.cid('X')) where reply_text is not null)::int, 1, 'public_reviews(X): kun det godkendte svar');
select tt.ok(not tt.fn_returns_column('public.public_reviews(uuid)', 'patient_id'), 'public_reviews() har ingen patient_id');
select tt.ok(not tt.fn_returns_column('public.public_reviews(uuid)', 'booking_id'), 'public_reviews() har ingen booking_id');
-- Ikke-verificerede
select tt.eq((select count(*) from public.public_reviews(tt.cid('A5')))::int, 0, 'public_reviews(importeret) er tom');
select tt.eq((select count(*) from public.public_reviews(tt.cid('A6')))::int, 0, 'public_reviews(registered) er tom');
select tt.eq((select count(*) from public.public_reviews(tt.cid('I')))::int, 0, 'public_reviews(oprindeligt importeret) er tom');
-- Statistik
select tt.eq((select count(*) from public.public_clinic_review_stats_many(array[tt.cid('A5'), tt.cid('A6'), tt.cid('R'), tt.cid('I')]))::int, 0, 'statistik for imported/registered er tom');
select tt.eq((select count(*) from public.public_clinic_review_stats_many(array[tt.cid('X'), tt.cid('A5'), tt.cid('A6')]))::int, 1, 'statistik returnerer kun X');
select tt.eq((select review_count from public.public_clinic_review_stats_many(array[tt.cid('X')])), 3, 'statistik tæller kun godkendte');
select tt.eq((select avg_stars from public.public_clinic_review_stats_many(array[tt.cid('X')])), 4.0, 'gennemsnit af godkendte');
select tt.eq((select price_accuracy_pct from public.public_clinic_review_stats_many(array[tt.cid('X')])), 50, 'prisnøjagtighed (1 + 0,5 + 0) / 3');
select tt.eq((select as_quoted_count from public.public_clinic_review_stats_many(array[tt.cid('X')])), 1, 'fordeling: as_quoted');
-- Under 3 godkendte anmeldelser: ingen procent
select tt.as_postgres();
select tt.eq((select price_accuracy_pct from public.public_clinic_review_stats_many(array[tt.cid('X')]) where false), null::int, 'kontrol');
update public.reviews set moderation_status = 'pending' where stars = 3 and clinic_id = tt.cid('X');
select tt.as_anon();
select tt.eq((select review_count from public.public_clinic_review_stats_many(array[tt.cid('X')])), 2, 'efter ændring: 2 godkendte');
select tt.eq((select price_accuracy_pct from public.public_clinic_review_stats_many(array[tt.cid('X')])), null::int, 'under 3 godkendte: ingen prisnøjagtighed');
-- Klinik- og patientfladen: kun godkendte vises for klinikken
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_reviews())::int, 2, 'clinic_reviews() viser kun godkendte');
select tt.rows('select 1 from public.reviews', 0, 'klinikken kan ikke læse reviews-tabellen');

rollback;
