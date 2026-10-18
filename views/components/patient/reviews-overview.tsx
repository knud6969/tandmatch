import { EligibleVisits } from "@/views/components/patient/eligible-visits";
import { OwnReviews } from "@/views/components/patient/own-reviews";

// Patientens anmeldelsesside: besøg, der kan anmeldes, og egne anmeldelser med status.
export function ReviewsOverview() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="skal-anmeldes" className="flex flex-col gap-3">
        <h2 id="skal-anmeldes" className="text-xl font-semibold text-ink">
          Besøg, du kan anmelde
        </h2>
        <EligibleVisits />
      </section>
      <section aria-labelledby="mine-anmeldelser" className="flex flex-col gap-3">
        <h2 id="mine-anmeldelser" className="text-xl font-semibold text-ink">
          Mine anmeldelser
        </h2>
        <OwnReviews />
      </section>
    </div>
  );
}
