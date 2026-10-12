-- Test 7: book_slot afviser lead der ikke er accepted, en andens lead, overlappende tid inkl. en held-akuttid,
-- tid uden for åbningstid, almindelig ydelse i akutvindue og tid i blokering.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Opsætning: pA har lead hos X (accepteret) og Y (sendt). pB har lead hos X (accepteret) og en held-akuttid hos Z.
select tt.mk_case('pB', 'SB_e');
select tt.mk_case('pA', 'S_z');
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);
select tt.as_user(tt.id('pB'));
select public.send_leads(tt.id('SB'), array[tt.cid('X')]);
select public.send_leads(tt.id('SB_e'), array[tt.cid('Z')], tt.svc('akut_konsultation'), tt.slot(3, 18), 'Bo Test', '+45 87654321');
select tt.as_user(tt.id('uX'));
select public.clinic_decide_lead(tt.lead('S', 'X'), 'accept');
select public.clinic_decide_lead(tt.lead('SB', 'X'), 'accept');
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('SB_e', 'Z')), 'held', 'opsætning: akuttiden hos Z er held');
select tt.mk_lead('S_z', 'Z', 'accepted');
insert into public.clinic_time_blocks (clinic_id, starts_at, ends_at, note) values (tt.cid('X'), tt.slot(5, 12), tt.slot(5, 14), 'Kursus');

select tt.as_user(tt.id('pA'));
-- Lead der ikke er accepteret, andens lead
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'Y'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                 'lead med status sent kan ikke bookes', 'LEAD_NOT_ACCEPTED');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                 'en andens lead kan ikke bookes', 'NOT_FOUND');
-- Ydelse der ikke er bekræftet på sagen
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('tandrensning'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                 'ydelse der ikke er på sagen', 'INVALID_SERVICE');
-- Uden for åbningstid, akutvindue for almindelig ydelse, blokering, horisont
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 7), 'Alma Test', '+45 12345678'),
                 'før åbning', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 21), 'Alma Test', '+45 12345678'),
                 'efter lukketid', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 16, 45), 'Alma Test', '+45 12345678'),
                 'ydelse der slutter efter lukketid / ind i akutvindue', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 17, 30), 'Alma Test', '+45 12345678'),
                 'almindelig ydelse i akutvindue', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(5, 12, 30), 'Alma Test', '+45 12345678'),
                 'tid i blokering', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(61, 10), 'Alma Test', '+45 12345678'),
                 'tid uden for horisonten', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), now() - interval '1 day', 'Alma Test', '+45 12345678'),
                 'tid i fortiden', 'SLOT_UNAVAILABLE');
select tt.rows('select 1 from public.bookings', 0, 'ingen af de afviste kald oprettede en booking');

-- En gyldig booking lykkes
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                  'gyldig booking hos X');

-- pB: samme tid og delvist overlap afvises, tilstødende tid lykkes
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Bo Test', '+45 87654321'),
                 'samme tid kan ikke bookes to gange', 'SLOT_TAKEN');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 15), 'Bo Test', '+45 87654321'),
                 'delvist overlap kan ikke bookes', 'SLOT_TAKEN');
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 30), 'Bo Test', '+45 87654321'),
                  'tilstødende tid kan bookes');

-- Held-akuttid hos Z blokerer for pA's booking
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_z', 'Z'), tt.svc('akut_konsultation'), tt.slot(3, 18), 'Alma Test', '+45 12345678'),
                 'en held-akuttid blokerer samme tid', 'SLOT_TAKEN');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_z', 'Z'), tt.svc('akut_konsultation'), tt.slot(3, 18, 15), 'Alma Test', '+45 12345678'),
                 'en held-akuttid blokerer delvist overlap', 'SLOT_TAKEN');
-- En akutydelse må bruge akutvinduet, når tiden er ledig (tilstødende, før den reserverede tid)
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('S_z', 'Z'), tt.svc('akut_konsultation'), tt.slot(3, 17, 30), 'Alma Test', '+45 12345678'),
                  'akutydelse i akutvindue, ledig tid');

rollback;
