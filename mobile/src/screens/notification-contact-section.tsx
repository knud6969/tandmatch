import { useCallback } from "react";
import type { NotificationContactDto } from "@/lib/identity/types/notification-contact";
import { getNotificationContact, saveNotificationContact } from "~/api/notifications";
import { NotificationContactForm } from "~/components/notifications/notification-contact-form";
import { LoadState } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";

// Henter patientens valgte e-mail og telefon og gemmer dem igen (identity 10.20). Formularen er en ren komponent.
export function NotificationContactSection() {
  const contact = useLoad(getNotificationContact);
  const save = useCallback((value: NotificationContactDto) => saveNotificationContact(value), []);
  const { run, pending, error } = useAction(save);
  return (
    <LoadState {...contact} onRetry={contact.reload}>
      {(data) => (
        <NotificationContactForm
          key={`${data.email}|${data.phone}`}
          initial={data}
          pending={pending}
          error={error}
          onSave={async (value) => (await run(value)) !== undefined}
        />
      )}
    </LoadState>
  );
}
