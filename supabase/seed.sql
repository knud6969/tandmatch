-- Referencedata, som ikke kræver auth-brugere (architecture 2.2): postnumre med omtrentlige koordinater.
-- Koordinaterne er ca.-værdier for postnummerets centrum til afstandssortering i demoen og skal verificeres
-- (fx mod DAWA) før rigtige brugere. Køres automatisk af `supabase db reset`.

insert into public.postal_codes (postal_code, city, lat, lng) values
  ('1050', 'København K', 55.6803, 12.5857),
  ('1200', 'København K', 55.6748, 12.589),
  ('1500', 'København V', 55.6683, 12.5632),
  ('2000', 'Frederiksberg', 55.6785, 12.5307),
  ('2100', 'København Ø', 55.7088, 12.5863),
  ('2200', 'København N', 55.693, 12.551),
  ('2300', 'København S', 55.6605, 12.595),
  ('2400', 'København NV', 55.703, 12.542),
  ('2500', 'Valby', 55.664, 12.512),
  ('2600', 'Glostrup', 55.664, 12.399),
  ('2650', 'Hvidovre', 55.647, 12.456),
  ('2700', 'Brønshøj', 55.7, 12.499),
  ('2800', 'Kongens Lyngby', 55.77, 12.504),
  ('2900', 'Hellerup', 55.7315, 12.577),
  ('3000', 'Helsingør', 56.0361, 12.6131),
  ('4000', 'Roskilde', 55.6415, 12.0803),
  ('5000', 'Odense C', 55.4038, 10.3883),
  ('6700', 'Esbjerg', 55.4765, 8.4594),
  ('7100', 'Vejle', 55.7093, 9.5357),
  ('8000', 'Aarhus C', 56.1572, 10.2107),
  ('9000', 'Aalborg', 57.0488, 9.9217)
on conflict (postal_code) do nothing;
