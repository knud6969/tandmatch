-- Test 40 (3.6b B2): AI'ens billedbeskrivelse deles kun med klinikken, når patienten har godkendt opsummeringen EFTER
-- beskrivelsen blev skrevet (cases.summary_approved_at >= case_images.ai_described_at). Billedet selv følger de øvrige
-- regler (samtykke m.m.). Også: ai_described_at sættes af databasen, og approve_summary() sætter summary_ai_assisted.
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.described(p_lead uuid) returns text language sql stable as $$
  select approved_description from public.clinic_lead_images(p_lead)
$$;
grant execute on function tt.described(uuid) to public;

-- Fixture: beskrivelsen er skrevet og opsummeringen godkendt i samme transaktion (samme tidspunkt) -> delt
select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X')]);
select tt.as_user(tt.id('uX'));
select tt.eq(tt.described(tt.lead('S', 'X')), 'Fiktivt billede af tænder', 'beskrivelse skrevet før godkendelsen deles');
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 1, 'billedet selv er synligt');

-- Beskrivelsen er nyere end godkendelsen -> skjult, men billedet er stadig synligt
select tt.as_postgres();
update public.case_images set ai_described_at = (select summary_approved_at + interval '1 minute' from public.cases where id = tt.id('S'))
 where case_id = tt.id('S');
select tt.as_user(tt.id('uX'));
select tt.eq(tt.described(tt.lead('S', 'X')), null::text, 'beskrivelse skrevet efter godkendelsen deles ikke');
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 1, 'billedet er stadig synligt uden beskrivelsen');

-- Uden godkendelse -> skjult
select tt.as_postgres();
update public.case_images set ai_described_at = (select summary_approved_at - interval '1 minute' from public.cases where id = tt.id('S'))
 where case_id = tt.id('S');
select tt.as_user(tt.id('uX'));
select tt.eq(tt.described(tt.lead('S', 'X')), 'Fiktivt billede af tænder', 'beskrivelse skrevet før godkendelsen (1 min) deles');
select tt.as_postgres();
select set_config('tm.system', 'on', true);
update public.cases set summary_approved_at = null where id = tt.id('S');
select set_config('tm.system', '', true);
select tt.as_user(tt.id('uX'));
select tt.eq(tt.described(tt.lead('S', 'X')), null::text, 'uden godkendelse deles beskrivelsen ikke');

-- Beskrivelse uden tidsstempel (ældre række) -> skjult
select tt.as_postgres();
select tt.approve_case('S');
update public.case_images set ai_described_at = null where case_id = tt.id('S');
select tt.as_user(tt.id('uX'));
select tt.eq(tt.described(tt.lead('S', 'X')), null::text, 'beskrivelse uden tidsstempel deles ikke');

-- En anden klinik uden lead ser intet
select tt.as_user(tt.id('uY'));
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('S', 'X')), 0, 'klinik uden lead ser hverken billede eller beskrivelse');

-- Databasen sætter tidsstemplet: ved skrivning af ai_description (også samme tekst) og ved indsættelse med beskrivelse
select tt.as_postgres();
update public.case_images set ai_described_at = now() - interval '1 day' where case_id = tt.id('S');
select tt.as_service();
select tt.allowed(format('update public.case_images set ai_view = %L, ai_quality = %L, ai_description = ai_description where case_id = %L', 'front', 'ok', tt.id('S')),
                  'service role kan skrive observationen');
select tt.as_postgres();
select tt.ok((select ai_described_at >= now() - interval '1 minute' from public.case_images where case_id = tt.id('S')), 'tidsstemplet sættes ved skrivning af ai_description');
select tt.as_postgres();
update public.case_images set ai_described_at = now() - interval '1 day' where case_id = tt.id('S');
select tt.as_service();
select tt.allowed(format('update public.case_images set ai_view = %L where case_id = %L', 'side_left', tt.id('S')), 'opdatering uden ai_description');
select tt.as_postgres();
select tt.ok((select ai_described_at < now() - interval '1 hour' from public.case_images where case_id = tt.id('S')), 'tidsstemplet røres ikke, når ai_description ikke skrives');
select tt.eq((select ai_described_at is null from public.case_images where id = tt.id('img_SB')), false, 'indsættelse med beskrivelse stempler');
select tt.as_service();
select tt.allowed(format('insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes) values (%L, %L, %L, %L, %L, 10, 10, 100)',
                         tt.id('img_new'), tt.id('SB'), tt.id('pB'), tt.consent('pB', 'image_upload'), tt.id('SB')::text || '/' || tt.id('img_new')::text || '.jpg'), 'opsætning: nyt billede uden beskrivelse');
select tt.as_postgres();
select tt.eq((select ai_described_at is null from public.case_images where id = tt.id('img_new')), true, 'indsættelse uden beskrivelse har intet tidsstempel');

-- Patienten kan ikke selv sætte tidsstemplet eller beskrivelsen
select tt.as_user(tt.id('pB'));
select tt.denied(format('update public.case_images set ai_described_at = now() where id = %L', tt.id('img_new')), 'patient kan ikke sætte ai_described_at', '42501');
select tt.denied(format('update public.case_images set ai_description = %L where id = %L', 'Min egen', tt.id('img_new')), 'patient kan ikke skrive ai_description', '42501');

-- approve_summary() og summary_ai_assisted (sag SB er en kladde uden AI-udkast)
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.approve_summary(%L, %L, true)', tt.id('SB'), 'Min tekst'), 'godkendelse med p_ai_assisted = true');
select tt.as_postgres();
select tt.eq((select summary_ai_assisted from public.cases where id = tt.id('SB')), false, 'uden AI-udkast er summary_ai_assisted altid false');
select tt.as_service();
select tt.allowed(format('select public.store_ai_summary(%L, %L, %L::jsonb, true, %L, %L)', tt.id('pB'), tt.id('SB'), '{"summaryText":"x"}', 'm', 'v'), 'opsætning: AI-udkast');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.approve_summary(%L, %L, true)', tt.id('SB'), 'Rettet tekst'), 'godkendelse bygger på AI-udkast');
select tt.as_postgres();
select tt.eq((select summary_ai_assisted from public.cases where id = tt.id('SB')), true, 'med AI-udkast og p_ai_assisted = true er den true');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.approve_summary(%L, %L, false)', tt.id('SB'), 'Helt egen tekst'), 'godkendelse med helt egen tekst');
select tt.as_postgres();
select tt.eq((select summary_ai_assisted from public.cases where id = tt.id('SB')), false, 'erstattet helt giver false');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.approve_summary(%L, %L)', tt.id('SB'), 'Uden angivelse'), 'godkendelse uden angivelse');
select tt.as_postgres();
select tt.eq((select summary_ai_assisted from public.cases where id = tt.id('SB')), false, 'uden angivelse bevares værdien');

rollback;
