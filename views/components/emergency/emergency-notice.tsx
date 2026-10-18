import Link from "next/link";
import { LIFE_THREATENING_REFERRAL_TEXT } from "@/lib/constants/ai-texts";
import { EMERGENCY_HREF } from "@/lib/navigation/entries";

// Fast akut-tekst: livstruende symptomer (112) og lægevagten (1813). Fælles for chattens akut-blok og /akut (architecture 6.1).
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
        <a href="tel:112" className="inline-flex min-h-11 items-center font-semibold underline">
          Ring 112
        </a>
        <a href="tel:1813" className="inline-flex min-h-11 items-center font-semibold underline">
          Ring 1813
        </a>
      </p>
    </div>
  );
}
