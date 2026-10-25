-- Oprydning: to hjælpefunktioner, som ingen policy, funktion, trigger eller TypeScript-kode bruger.
-- auth_role() (20261012000100) og is_verified_clinic_owner() (20261012000300) blev aldrig taget i brug; policies bruger
-- is_admin(), auth_clinic_id(), is_clinic_owner() og is_my_clinic_lead(). Uden cascade, så dropningen fejler, hvis noget
-- alligevel afhænger af dem.

drop function public.auth_role();
drop function public.is_verified_clinic_owner();
