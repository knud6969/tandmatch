import Link from "next/link";
import { LIFE_THREATENING_REFERRAL_TEXT } from "@/lib/constants/ai-texts";
import { EMERGENCY_CALL_NUMBER, OUT_OF_HOURS_NUMBER } from "@/lib/constants/emergency";
import { EMERGENCY_HREF } from "@/lib/navigation/entries";

// Fast akut-tekst: livstruende symptomer (112) og lægevagten. Fælles for chattens akut-blok og /akut (architecture 6.1).
// Med `linkToEmergency` fører en knap til akutvejen; på /akut selv er den overflødig.
export function EmergencyNotice({ linkToEmergency = false }: { linkToEmergency?: boolean }) {
  return (
    <div role="alert" data-testid="akut-blok" className="rounded-control border border-danger-line bg-danger-bg p-3 text-danger-ink">
      <p className="text-sm font-semibold">Det kan være akut</p>
      <p className="mt-1 text-sm leading-snug">{LIFE_THREATENING_REFERRAL_TEXT}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {linkToEmergency && (
          <Link href={EMERGENCY_HREF} className="inline-flex min-h-11 basis-full items-center font-semibold underline sm:basis-auto">
            Se klinikker med ledig akuttid
          </Link>
        )}
        <a href={`tel:${EMERGENCY_CALL_NUMBER}`} className="inline-flex min-h-11 items-center font-semibold underline">
          Ring {EMERGENCY_CALL_NUMBER}
        </a>
        <a href={`tel:${OUT_OF_HOURS_NUMBER}`} className="inline-flex min-h-11 items-center font-semibold underline">
          Ring {OUT_OF_HOURS_NUMBER} (Region Hovedstaden)
        </a>
      </p>
    </div>
  );
}
