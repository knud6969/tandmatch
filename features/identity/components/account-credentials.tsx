"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChangeEmailForm } from "@/features/identity/components/change-email-form";
import { ChangePasswordForm } from "@/features/identity/components/change-password-form";
import { apiRequest } from "@/platform/ui-utils/api-client";
import { useLoad } from "@/platform/ui-utils/use-load";
import type { AccountDto } from "@/lib/identity/types/auth";

type Open = "email" | "password" | null;

const loadAccount = () => apiRequest<AccountDto>("/api/auth/account");

// Klinikkens login: e-mail og adgangskode (architecture 10.2). Står i kontoindstillingerne på /klinik/profil.
export function AccountCredentials() {
  const account = useLoad(loadAccount);
  const [open, setOpen] = useState<Open>(null);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-ink">Login</h2>
      <p className="text-base text-ink-muted">
        E-mail:{" "}
        <span className="font-semibold break-all text-ink">
          {account.data ? account.data.email : account.error ? "kunne ikke hentes" : "henter …"}
        </span>
      </p>
      {open === "email" && <ChangeEmailForm onClose={() => setOpen(null)} />}
      {open === "password" && <ChangePasswordForm onClose={() => setOpen(null)} />}
      {open === null && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" onClick={() => setOpen("email")}>
            Skift e-mail
          </Button>
          <Button variant="secondary" onClick={() => setOpen("password")}>
            Skift adgangskode
          </Button>
        </div>
      )}
    </Card>
  );
}
