-- Test 1: Klinik X og Y har begge et lead på sag S. X kan ikke læse Y's lead, beslutning, beskeder eller bookinger
-- (direkte tabel og via funktioner).
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Opsætning: pA sender S til X og Y; Y accepterer; begge parter skriver til Y's tråd; pA booker hos Y.
select tt.as_user(tt.id('pA'));
select tt.eq(public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')])::int, 2, 'send_leads til X og Y');
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'accept', 'Hemmelig kommentar fra Y', 1111, 2222);
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'Y'), tt.id('uY'), 'Besked fra Y til patienten');
select tt.as_user(tt.id('pA'));
insert into public.messages (lead_id, sender_id, body) values (tt.lead('S', 'Y'), tt.id('pA'), 'Besked fra patienten til Y');
select public.book_slot(tt.lead('S', 'Y'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678');

-- Y kan selv se sit materiale (kontrol af at opsætningen virker)
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.leads', 1, 'Y ser sit eget lead');
select tt.rows('select 1 from public.messages', 0, 'klinikken har ingen direkte læsning af messages');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'Y')))::int, 2, 'Y ser sin egen tråd via clinic_lead_messages');
select tt.rows($$select 1 from public.clinic_bookings(now() - interval '1 day', now() + interval '30 days')$$, 1, 'Y ser sin egen booking');

-- X
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.leads', 1, 'X ser kun ét lead');
select tt.rows(format('select 1 from public.leads where clinic_id = %L', tt.cid('Y')), 0, 'X kan ikke læse Y''s lead (tabel)');
select tt.rows(format('select 1 from public.leads where clinic_comment is not null or quoted_price_min is not null'), 0, 'X kan ikke læse Y''s beslutning');
select tt.rows('select 1 from public.messages', 0, 'X kan ikke læse Y''s beskeder (tabel)');
select tt.rows('select 1 from public.bookings', 0, 'X kan ikke læse Y''s bookinger (tabel)');
select tt.rows(format('select 1 from public.clinic_lead_detail(%L)', tt.lead('S', 'Y')), 0, 'clinic_lead_detail(Y''s lead) er tom for X');
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'Y')), 0, 'clinic_lead_images(Y''s lead) er tom for X');
select tt.rows('select 1 from public.clinic_leads()', 1, 'clinic_leads() giver kun X''s eget lead');
select tt.rows(format('select 1 from public.clinic_leads() where lead_id = %L', tt.lead('S', 'Y')), 0, 'clinic_leads() indeholder ikke Y''s lead');
select tt.rows($$select 1 from public.clinic_bookings(now() - interval '1 day', now() + interval '30 days')$$, 0, 'clinic_bookings() indeholder ikke Y''s booking');
select tt.rows('select 1 from public.clinic_reviews()', 0, 'clinic_reviews() er tom');

-- X kan ikke handle på Y's lead, booking eller tråd
select tt.denied(format('select public.clinic_decide_lead(%L, %L, null, null, null, %L)', tt.lead('S', 'Y'), 'decline', 'other'),
                 'X kan ikke afvise Y''s lead', 'NOT_FOUND');
select tt.denied(format('select public.cancel_booking(%L)', (select tt.booking(tt.lead('S', 'Y')))), 'X kan ikke aflyse Y''s booking', 'NOT_FOUND');
select tt.denied(format('select public.mark_booking_no_show(%L)', (select tt.booking(tt.lead('S', 'Y')))), 'X kan ikke markere Y''s booking', 'NOT_FOUND');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('uX'), 'x'),
                 'X kan ikke skrive i Y''s tråd');
select tt.denied(format('update public.leads set status = %L where id = %L', 'declined', tt.lead('S', 'Y')), 'X kan ikke opdatere leads direkte');

-- Y ser heller ikke X's lead
select tt.as_user(tt.id('uY'));
select tt.rows(format('select 1 from public.leads where clinic_id = %L', tt.cid('X')), 0, 'Y kan ikke læse X''s lead');
select tt.rows(format('select 1 from public.clinic_lead_detail(%L)', tt.lead('S', 'X')), 0, 'clinic_lead_detail(X''s lead) er tom for Y');

rollback;
