-- Version af tandlægeportrættet til cache-busting (?v=...), som logoet bruger clinics.updated_at.
-- Sættes af applikationen, når portrættet lægges ind eller fjernes (ClinicDentistsRepository.setPhotoPath).
alter table public.clinic_dentists add column photo_updated_at timestamptz null;

update public.clinic_dentists set photo_updated_at = created_at where photo_path is not null;
