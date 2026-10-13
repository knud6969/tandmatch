"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Alert } from "@/views/components/ui/alert";
import { Button } from "@/views/components/ui/button";
import { Card } from "@/views/components/ui/card";
import { TextArea } from "@/views/components/ui/text-area";
import { TextField } from "@/views/components/ui/text-field";
import { LoadState } from "@/views/components/clinic/load-state";
import { PortfolioEditor } from "@/views/components/clinic/portfolio-editor";
import { SaveBar } from "@/views/components/clinic/save-bar";
import { useLoad } from "@/views/components/clinic/use-load";
import { apiRequest } from "@/views/utils/api-client";
import { apiErrorMessage } from "@/views/utils/api-errors";
import { fieldErrorsFrom, type FieldErrors } from "@/views/utils/field-errors";
import { IMAGE_ACCEPT, ImagePrepareError, prepareImage } from "@/views/utils/prepare-image";
import { DENTIST_BIO_MAX_CHARS } from "@/lib/constants/clinics";
import { createDentistSchema } from "@/lib/schemas/clinics";
import type { DentistDto } from "@/lib/types/clinics";
import type { ServiceDto, ServiceGroupDto } from "@/lib/types/services";

type Loaded = { dentists: DentistDto[]; services: ServiceDto[] };
type Field = "fullName" | "title" | "bio";
type DentistValues = { fullName: string; title: string; bio: string };

async function loadAll(): Promise<Loaded> {
  const [dentists, services] = await Promise.all([
    apiRequest<{ dentists: DentistDto[] }>("/api/clinics/me/dentists"),
    apiRequest<{ groups: ServiceGroupDto[] }>("/api/services"),
  ]);
  return { dentists: dentists.dentists, services: services.groups.flatMap((group) => group.services) };
}

// Tandlæger med portræt og portefølje (architecture 4.3 `clinic_dentists`, 9.5, 10.8). Tandlæger er kun til visning
// og har intet login. Hver tandlæge gemmes for sig.
export function DentistsEditor() {
  const { data, error, loading, reload } = useLoad(loadAll);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  return <DentistList initial={data.dentists} services={data.services} />;
}

function DentistList({ initial, services }: { initial: DentistDto[]; services: ServiceDto[] }) {
  const [dentists, setDentists] = useState(initial);

  const replace = (next: DentistDto) => setDentists((list) => list.map((d) => (d.id === next.id ? next : d)));
  const remove = (id: string) => setDentists((list) => list.filter((d) => d.id !== id));

  return (
    <div className="flex flex-col gap-8">
      <AddDentist
        nextSortOrder={dentists.length}
        onAdded={(dentist) => setDentists((list) => [...list, dentist])}
        hasDentists={dentists.length > 0}
      />
      {dentists.length > 0 && (
        <ul className="grid gap-6">
          {dentists.map((dentist) => (
            <li key={dentist.id}>
              <DentistCard dentist={dentist} services={services} onChange={replace} onDeleted={() => remove(dentist.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function toValues(dentist: DentistDto): DentistValues {
  return { fullName: dentist.fullName, title: dentist.title ?? "", bio: dentist.bio ?? "" };
}

function AddDentist({ nextSortOrder, onAdded, hasDentists }: { nextSortOrder: number; onAdded: (d: DentistDto) => void; hasDentists: boolean }) {
  const [values, setValues] = useState<DentistValues>({ fullName: "", title: "", bio: "" });
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createDentistSchema.safeParse({ ...values, sortOrder: nextSortOrder });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      return;
    }
    setErrors({ fields: {}, general: null });
    setBusy(true);
    setMessage(null);
    try {
      const created = await apiRequest<DentistDto>("/api/clinics/me/dentists", { method: "POST", body: parsed.data });
      onAdded({ ...created, portfolio: created.portfolio ?? [] });
      setValues({ fullName: "", title: "", bio: "" });
    } catch (e) {
      setMessage(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold text-ink">{hasDentists ? "Tilføj endnu en tandlæge" : "Tilføj den første tandlæge"}</h2>
        {message && <Alert tone="danger" role="alert">{message}</Alert>}
        <TextField label="Navn" name="fullName" autoComplete="off" value={values.fullName} onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))} error={errors.fields.fullName} required />
        <TextField label="Titel (valgfri)" name="title" placeholder="Fx Tandlæge eller Specialtandlæge i ortodonti" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} error={errors.fields.title} />
        <TextArea label="Kort præsentation (valgfri)" name="bio" maxLength={DENTIST_BIO_MAX_CHARS} value={values.bio} onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} error={errors.fields.bio} className="min-h-24" />
        <Button type="submit" disabled={busy} className="sm:self-start">
          {busy ? "Tilføjer …" : "Tilføj tandlæge"}
        </Button>
      </form>
    </Card>
  );
}

type DentistCardProps = {
  dentist: DentistDto;
  services: ServiceDto[];
  onChange: (dentist: DentistDto) => void;
  onDeleted: () => void;
};

function DentistCard({ dentist, services, onChange, onDeleted }: DentistCardProps) {
  const photoInput = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(() => toValues(dentist));
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<FieldErrors<Field>>({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createDentistSchema.safeParse({ ...values, sortOrder: dentist.sortOrder });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom<Field>(parsed.error));
      setSaveError("Ret felterne markeret med rødt.");
      return;
    }
    setErrors({ fields: {}, general: null });
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await apiRequest<DentistDto>(`/api/clinics/me/dentists/${dentist.id}`, { method: "PATCH", body: parsed.data });
      // PATCH returnerer tandlægen; porteføljen beholdes fra visningen, hvis svaret ikke indeholder den.
      onChange({ ...dentist, ...updated, portfolio: updated.portfolio ?? dentist.portfolio });
      const next = toValues({ ...dentist, ...updated });
      setSaved(next);
      setValues(next);
      setSavedAt(new Date());
    } catch (e) {
      setSaveError(apiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      const prepared = await prepareImage(file, 1024);
      const form = new FormData();
      form.set("file", prepared);
      const result = await apiRequest<{ photoUrl: string }>(`/api/clinics/me/dentists/${dentist.id}/photo`, { method: "POST", form });
      onChange({ ...dentist, photoUrl: result.photoUrl });
    } catch (e) {
      setPhotoMessage(e instanceof ImagePrepareError ? e.message : apiErrorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoMessage(null);
    try {
      await apiRequest<void>(`/api/clinics/me/dentists/${dentist.id}/photo`, { method: "DELETE" });
      onChange({ ...dentist, photoUrl: null });
    } catch (e) {
      setPhotoMessage(apiErrorMessage(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest<void>(`/api/clinics/me/dentists/${dentist.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      setDeleteError(apiErrorMessage(e));
      setDeleting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-muted">
          {dentist.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Offentlig URL fra storage; ingen next/image-optimering i prototypen.
            <img src={dentist.photoUrl} alt={`Portræt af ${dentist.fullName}`} className="size-full object-cover" />
          ) : (
            <span className="px-2 text-center text-sm text-ink-muted">Intet portræt</span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="truncate text-xl font-semibold text-ink">{dentist.fullName}</h3>
          <div className="flex flex-wrap gap-2">
            <input ref={photoInput} type="file" accept={IMAGE_ACCEPT} onChange={onPhoto} className="sr-only" aria-label={`Vælg portræt af ${dentist.fullName}`} tabIndex={-1} />
            <Button variant="secondary" className="min-h-11 px-4" disabled={photoBusy} onClick={() => photoInput.current?.click()}>
              {photoBusy ? "Arbejder …" : dentist.photoUrl ? "Skift portræt" : "Upload portræt"}
            </Button>
            {dentist.photoUrl && (
              <Button variant="ghost" className="min-h-11 px-4" disabled={photoBusy} onClick={removePhoto}>
                Fjern portræt
              </Button>
            )}
          </div>
        </div>
      </div>
      {photoMessage && <Alert tone="danger" role="alert">{photoMessage}</Alert>}

      <form onSubmit={onSave} noValidate className="flex flex-col gap-5">
        <TextField label="Navn" autoComplete="off" value={values.fullName} onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))} error={errors.fields.fullName} required />
        <TextField label="Titel" autoComplete="off" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} error={errors.fields.title} />
        <TextArea label="Kort præsentation" maxLength={DENTIST_BIO_MAX_CHARS} value={values.bio} onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))} error={errors.fields.bio} className="min-h-24" />
        <SaveBar sticky={false} dirty={dirty} saving={saving} savedAt={savedAt} error={saveError} label="Gem tandlæge" />
      </form>

      <PortfolioEditor
        dentistId={dentist.id}
        dentistName={dentist.fullName}
        items={dentist.portfolio}
        services={services}
        onChange={(portfolio) => onChange({ ...dentist, portfolio })}
      />

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        {!confirmDelete ? (
          <Button variant="danger-outline" className="self-start" onClick={() => setConfirmDelete(true)}>
            Slet tandlæge
          </Button>
        ) : (
          <Alert tone="danger" title={`Slet ${dentist.fullName}?`}>
            <p>Portrættet og alle tandlægens porteføljebilleder slettes også. Det kan ikke fortrydes.</p>
            {deleteError && <p className="mt-2 font-semibold">{deleteError}</p>}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <Button variant="danger" disabled={deleting} onClick={onDelete}>
                {deleting ? "Sletter …" : "Ja, slet tandlægen"}
              </Button>
              <Button variant="ghost" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                Fortryd
              </Button>
            </div>
          </Alert>
        )}
      </div>
    </Card>
  );
}
