-- Fælles fiktive testdata. Indlæses efter _helpers.sql i samme transaktion og forsvinder ved rollback.
-- Alt køres som postgres. Navne:
--   patienter  pA, pB, pC (permanente; pC har ingen samtykker), pAnon (anonym)
--   klinikker  X, Y, Z, W, V, A1..A6 (verificerede, ejer u<navn>), R (registered), I (imported, uden ejer)
--   sager      S (pA, med billede og AI-samtale), SB (pB, samme), SAnon (pAnon, kladde med billede og samtale)

-- ---------------------------------------------------------------------------------------------------------
-- Byggeklodser
-- ---------------------------------------------------------------------------------------------------------
create function tt.approve_case(p_case text) returns void language plpgsql as $$
begin
  perform set_config('tm.system', 'on', true);
  update public.cases set summary_text = 'Fiktiv opsummering til test.', summary_approved_at = now() where id = tt.id(p_case);
  perform set_config('tm.system', '', true);
end $$;

-- Sag med ydelser, valgfrit billede og valgfrit godkendt opsummering. Kører som postgres.
create function tt.mk_case(
  p_patient text, p_case text,
  p_services text[] default array['undersoegelse', 'akut_konsultation'],
  p_approve boolean default true, p_image boolean default false
) returns void language plpgsql as $$
declare s text;
begin
  insert into public.cases (id, patient_id, postal_code, preferred_timeframe)
  values (tt.id(p_case), tt.id(p_patient), '2100', 'within_2_weeks');
  foreach s in array coalesce(p_services, '{}') loop
    insert into public.case_services (case_id, service_id) values (tt.id(p_case), tt.svc(s));
  end loop;
  if p_image then
    insert into public.case_images (id, case_id, patient_id, consent_id, storage_path, ai_description, width, height, bytes)
    values (tt.id('img_' || p_case), tt.id(p_case), tt.id(p_patient), tt.consent(p_patient, 'image_upload'),
            tt.id(p_case)::text || '/' || tt.id('img_' || p_case)::text || '.jpg', 'Fiktivt billede af tænder', 800, 600, 50000);
  end if;
  if p_approve then
    perform tt.approve_case(p_case);
  end if;
end $$;

-- Lead direkte (uden send_leads). Sætter sagen til submitted. Kører som postgres.
create function tt.mk_lead(p_case text, p_clinic text, p_status public.lead_status default 'sent') returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('tm.system', 'on', true);
  update public.cases set status = 'submitted', submitted_at = coalesce(submitted_at, now())
   where id = tt.id(p_case) and status = 'draft';
  perform set_config('tm.system', '', true);
  insert into public.leads (case_id, clinic_id, status, decline_reason, responded_at, withdrawn_at)
  values (tt.id(p_case), tt.cid(p_clinic), p_status,
          case when p_status = 'declined' then 'other'::public.lead_decline_reason end,
          case when p_status in ('declined', 'accepted', 'booked') then now() end,
          case when p_status = 'withdrawn' then now() end)
  returning id into v_id;
  return v_id;
end $$;

-- Booking direkte. Klinik og patient udledes af leadet (bookings_guard). Kører som postgres.
create function tt.mk_booking(
  p_lead uuid, p_service text, p_starts timestamptz, p_status public.booking_status default 'booked',
  p_minutes integer default 30, p_hold_expires timestamptz default null
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, hold_expires_at,
                               contact_name, contact_phone, contact_email, cancelled_by, cancelled_at, no_show_at, completed_at)
  values (p_lead, tt.cid('X'), tt.id('pA'), tt.svc(p_service), p_starts, p_starts + make_interval(mins => p_minutes), p_status,
          case when p_status = 'held' then coalesce(p_hold_expires, now() + interval '20 minutes') end,
          'Alma Test', '+45 12 34 56 78', 'alma@test.invalid',
          case when p_status = 'cancelled' then 'patient'::public.booking_actor end,
          case when p_status = 'cancelled' then now() end,
          case when p_status = 'no_show' then now() end,
          case when p_status = 'completed' then now() end)
  returning id into v_id;
  return v_id;
end $$;

grant execute on all functions in schema tt to public;

-- ---------------------------------------------------------------------------------------------------------
-- Brugere
-- ---------------------------------------------------------------------------------------------------------
insert into tt.clinic_names (name, cvr) values
  ('X', '10000001'), ('Y', '10000002'), ('Z', '10000003'), ('W', '10000004'), ('V', '10000005'),
  ('A1', '10000006'), ('A2', '10000007'), ('A3', '10000008'), ('A4', '10000009'), ('A5', '10000010'),
  ('A6', '10000011'), ('R', '10000012'), ('I', '10000013');

insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('pA'), 'pa@test.invalid', false, '{"role":"patient","first_name":"Alma"}'),
  (tt.id('pB'), 'pb@test.invalid', false, '{"role":"patient","first_name":"Bo"}'),
  (tt.id('pC'), 'pc@test.invalid', false, '{"role":"patient","first_name":"Carl"}'),
  (tt.id('pAnon'), null, true, '{}');

insert into auth.users (id, email, is_anonymous, raw_user_meta_data)
select tt.id('u' || n.name), 'klinik-' || lower(n.name) || '@test.invalid', false,
       jsonb_build_object('role', 'clinic', 'cvr', n.cvr, 'clinic_name', 'Testklinik ' || n.name,
                          'address', 'Testvej 1', 'postal_code', '2100', 'city', 'København Ø', 'phone', '+45 11 22 33 44')
  from tt.clinic_names n
 where n.name <> 'I';

-- Importeret klinik uden konto
insert into public.clinics (status, cvr, name, address, postal_code, city, lat, lng)
select 'imported', n.cvr, 'Importeret klinik', 'Importvej 2', '2200', 'København N', 55.693, 12.551
  from tt.clinic_names n where n.name = 'I';

-- Verificér de 11 (admin_set_clinic_status er kun for service role/postgres)
select public.admin_set_clinic_status(tt.cid(n.name), 'verified')
  from tt.clinic_names n where n.name not in ('R', 'I');

-- Åbningstider: alle ugens dage 08-17 (almindelig) og 17-20 (akutvindue)
insert into public.clinic_opening_hours (clinic_id, weekday, opens_at, closes_at, is_emergency)
select c.id, d, '08:00'::time, '17:00'::time, false from public.clinics c, generate_series(1, 7) d
union all
select c.id, d, '17:00'::time, '20:00'::time, true from public.clinics c, generate_series(1, 7) d;

-- Prislister
insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min)
select c.id, tt.svc('undersoegelse'), 500, 800, 30 from public.clinics c
union all
select c.id, tt.svc('akut_konsultation'), 900, 1200, 30 from public.clinics c;

-- Tandlæger og portefølje (kun X, R og I; pladsholdere)
insert into public.clinic_dentists (id, clinic_id, full_name, title)
select tt.id('d' || n.name), tt.cid(n.name), 'Tandlæge Test ' || n.name, 'Tandlæge' from tt.clinic_names n where n.name in ('X', 'R', 'I');
insert into public.portfolio_items (id, clinic_id, dentist_id, image_path, caption, patient_consent_confirmed_at, consent_text_version)
select tt.id('pf' || n.name), tt.cid(n.name), tt.id('d' || n.name), 'placeholder/' || n.name || '.jpg', 'Pladsholder', now(), 'v1'
  from tt.clinic_names n where n.name in ('X', 'R', 'I');

-- ---------------------------------------------------------------------------------------------------------
-- Vilkår og samtykker
-- ---------------------------------------------------------------------------------------------------------
insert into public.terms_acceptances (user_id, terms_version, privacy_version, accepted_at)
values (tt.id('pA'), 'v1', 'v1', now()), (tt.id('pB'), 'v1', 'v1', now());

insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
select tt.id(p), t.type, t.v, false
  from unnest(array['pA', 'pB']) p,
       (values ('ai_processing'::public.consent_type, 'ai_processing@v0-prototype'),
               ('image_upload', 'image_upload@v1-ai-disclosure'),
               ('health_data_sharing', 'health_data_sharing@v0-prototype')) t(type, v);
insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values
  (tt.id('pAnon'), 'ai_processing', 'ai_processing@v0-prototype', true),
  (tt.id('pAnon'), 'image_upload', 'image_upload@v1-ai-disclosure', true);

-- ---------------------------------------------------------------------------------------------------------
-- Sager med billede og AI-samtale
-- ---------------------------------------------------------------------------------------------------------
select tt.mk_case('pA', 'S', p_approve => false, p_image => true);
select tt.mk_case('pB', 'SB', p_approve => false, p_image => true);
select tt.mk_case('pAnon', 'SAnon', p_approve => false, p_image => true);

insert into public.ai_conversations (id, case_id, patient_id, ai_consent_id) values
  (tt.id('convS'), tt.id('S'), tt.id('pA'), tt.consent('pA', 'ai_processing')),
  (tt.id('convSB'), tt.id('SB'), tt.id('pB'), tt.consent('pB', 'ai_processing')),
  (tt.id('convSAnon'), tt.id('SAnon'), tt.id('pAnon'), tt.consent('pAnon', 'ai_processing'));
insert into public.ai_messages (conversation_id, patient_id, role, content)
select c.id, c.patient_id, 'user', 'Jeg har et mellemrum mellem to tænder.' from public.ai_conversations c;
insert into public.ai_messages (conversation_id, patient_id, role, content)
select c.id, c.patient_id, 'assistant', 'Tak. Kan du beskrive, hvad du ønsker?' from public.ai_conversations c;

-- Opsummeringerne godkendes til sidst (AI-beskeder og billeder nulstiller godkendelsen)
select tt.approve_case('S');
select tt.approve_case('SB');
