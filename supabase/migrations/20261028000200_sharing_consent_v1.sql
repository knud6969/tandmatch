-- Delingssamtykke v1 (architecture 4.3, 10.3): ny tekstversion til klinikmodellen.
-- Ældre samtykker (v0-prototype) bliver stående som gyldige rækker, men giver ikke ret til at sende nye leads.
insert into public.consent_text_versions (type, text_version, ai_disclosure) values
  ('health_data_sharing', 'health_data_sharing@v1-klinikker', false);
