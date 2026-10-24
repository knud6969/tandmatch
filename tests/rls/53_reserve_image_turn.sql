-- Test 53: reserve_image_turn() (billedtur, cases 7.9c): kun service role; ejer, kladde, begge samtykker og aktiv samtale
-- kræves; højst én tur pr. upload-batch (ai_turn_at); døgnloft; ingen brugerbesked og ingen tælling som patientbesked.
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- Ingen klient kan kalde funktionen
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pA'), tt.id('convS')), 'patient kan ikke kalde reserve_image_turn()', '42501');
select tt.as_anon();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pAnon'), tt.id('convSAnon')), 'anon kan ikke kalde reserve_image_turn()', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pA'), tt.id('convS')), 'klinik kan ikke kalde reserve_image_turn()', '42501');

select tt.as_service();
-- En andens samtale
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pB'), tt.id('convS')), 'andens samtale afvises', 'NOT_FOUND');

-- Første tur tager billedet; anden tur har intet nyt
select tt.as_postgres();
select set_config('t.users', (select count(*)::text from public.ai_messages where conversation_id = tt.id('convS') and role = 'user'), false),
       set_config('t.count', (select user_message_count::text from public.ai_conversations where id = tt.id('convS')), false);
select tt.as_service();
select tt.allowed(format('select public.reserve_image_turn(%L, %L)', tt.id('pA'), tt.id('convS')), 'service role kan reservere en billedtur');
select tt.as_postgres();
do $$ begin
  if (select ai_turn_at from public.case_images where id = tt.id('img_S')) is null then raise exception 'TEST FEJLET: billedet blev ikke stemplet'; end if;
  if (select count(*) from public.ai_messages where conversation_id = tt.id('convS') and role = 'user') <> current_setting('t.users')::int
     or (select user_message_count from public.ai_conversations where id = tt.id('convS')) <> current_setting('t.count')::int then
    raise exception 'TEST FEJLET: billedturen må ikke indsætte eller tælle en brugerbesked';
  end if;
end $$;
select tt.as_service();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pA'), tt.id('convS')), 'ingen nye billeder', 'NO_NEW_IMAGES');

-- Et nyt billede giver en ny tur, men kun én for batchen
select tt.as_postgres();
insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, width, height, bytes)
values (tt.id('img_S2'), tt.id('S'), tt.id('pA'), tt.consent('pA', 'image_upload'), tt.id('S')::text || '/' || tt.id('img_S2')::text || '.jpg', 10, 10, 100),
       (tt.id('img_S3'), tt.id('S'), tt.id('pA'), tt.consent('pA', 'image_upload'), tt.id('S')::text || '/' || tt.id('img_S3')::text || '.jpg', 10, 10, 100);
select tt.as_service();
do $$ declare v uuid[]; begin
  v := public.reserve_image_turn(tt.id('pA'), tt.id('convS'));
  if cardinality(v) <> 2 then raise exception 'TEST FEJLET: begge nye billeder skulle være med i samme tur (%)', cardinality(v); end if;
end $$;
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pA'), tt.id('convS')), 'højst én tur pr. batch', 'NO_NEW_IMAGES');

-- Døgnloftet
select tt.as_postgres();
insert into public.ai_patient_usage_daily (patient_id, day, image_turns)
values (tt.id('pB'), (now() at time zone 'utc')::date, public.ai_limit('image_turns_per_patient_day'));
select tt.as_service();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pB'), tt.id('convSB')), 'døgnloftet for billedture', 'RATE_LIMITED');
select tt.as_postgres();
do $$ begin
  if (select ai_turn_at from public.case_images where id = tt.id('img_SB')) is not null then
    raise exception 'TEST FEJLET: en afvist tur må ikke stemple billedet';
  end if;
end $$;

-- Kladde og samtykker
select tt.as_postgres();
update public.ai_conversations set status = 'closed' where id = tt.id('convSAnon');
select tt.as_service();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pAnon'), tt.id('convSAnon')), 'lukket samtale', 'CHAT_LIMIT');
select tt.as_postgres();
update public.consents set withdrawn_at = now() where patient_id = tt.id('pB') and type = 'image_upload';
select tt.as_service();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pB'), tt.id('convSB')), 'uden image_upload-samtykke', 'IMAGE_CONSENT_REQUIRED');
select tt.as_postgres();
update public.consents set withdrawn_at = now() where patient_id = tt.id('pB') and type = 'ai_processing';
select tt.as_service();
select tt.denied(format('select public.reserve_image_turn(%L, %L)', tt.id('pB'), tt.id('convSB')), 'uden ai_processing-samtykke', 'CONSENT_REQUIRED');

rollback;
