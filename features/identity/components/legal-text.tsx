import { PrivacySections } from "@/features/site/ui";
import { TermsSections } from "@/features/identity/components/terms-sections";

// Teksten i vilkårs-dialogen: brugervilkår og privatlivspolitik, de samme afsnit som på /vilkaar og /privatliv.
// Server-komponent; siderne giver den videre til klientformularerne som children.
export function LegalText() {
  return (
    <>
      <h3 className="text-2xl font-semibold tracking-tight text-ink">Brugervilkår</h3>
      <TermsSections />
      <h3 className="mt-4 text-2xl font-semibold tracking-tight text-ink">Privatlivspolitik</h3>
      <PrivacySections />
    </>
  );
}
