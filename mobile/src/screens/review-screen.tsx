import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { ReviewEligibleItemDto } from "@/lib/booking/types/reviews";
import { createReview, listEligibleReviews } from "~/api/reviews";
import { AccountRequired } from "~/screens/account-required";
import { StarInput } from "~/components/review/star-input";
import { BackLink, Button, Card, Checkbox, CheckboxText, Chip, LoadState, Screen, StatusMessage, TextField } from "~/components/ui";
import { useAction } from "~/hooks/use-action";
import { useLoad } from "~/hooks/use-load";
import { colors, spacing, type } from "~/theme";
import { formatDate, formatPriceRange } from "@/lib/common/domain/format";
import type { FieldErrors } from "~/utils/field-errors";
import { EMPTY_REVIEW, parseReview, PRICE_ACCURACY_OPTIONS, REVIEW_TEXT_LIMITS, type ReviewField, type ReviewValues } from "~/utils/review-form";

const NOT_ELIGIBLE_TEXT = "Dette besøg kan ikke anmeldes (endnu).";

function ReviewForm({ item, onDone }: { item: ReviewEligibleItemDto; onDone: () => void }) {
  const [values, setValues] = useState<ReviewValues>(EMPTY_REVIEW);
  const [errors, setErrors] = useState<FieldErrors<ReviewField>>({});
  const set = <K extends keyof ReviewValues>(key: K, value: ReviewValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const submit = useAction(async () => {
    const parsed = parseReview(item.bookingId, values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return false;
    }
    setErrors({});
    await createReview(parsed.data);
    onDone();
    return true;
  });
  const estimate = item.priceEstimate;

  return (
    <>
      <Card>
        <Text style={styles.heading}>{item.clinicName}</Text>
        <Text style={styles.body}>
          {item.serviceName}, besøg {formatDate(`${item.visitedOn}T12:00:00Z`)}
        </Text>
        {estimate ? (
          <Text style={styles.muted}>
            Prisoverslag (klinikkens præciserede pris eller prisliste): {formatPriceRange(estimate.min, estimate.max)}
          </Text>
        ) : null}
      </Card>

      <StarInput value={values.stars} onChange={(n) => set("stars", n)} error={errors.stars} />

      <View style={styles.group}>
        <TextField
          label="Din anmeldelse"
          value={values.text}
          onChangeText={(t) => set("text", t)}
          error={errors.text}
          multiline
          maxLength={REVIEW_TEXT_LIMITS.max}
        />
        <Text style={styles.muted}>Mindst {REVIEW_TEXT_LIMITS.min} tegn. Modereres før visning; ingen personoplysninger om andre.</Text>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Svarede den endelige pris til prisoverslaget?</Text>
        {PRICE_ACCURACY_OPTIONS.map((option) => (
          <Chip key={option.value} label={option.label} selected={values.priceAccuracy === option.value} onPress={() => set("priceAccuracy", option.value)} />
        ))}
        {errors.priceAccuracy ? <Text style={styles.error}>{errors.priceAccuracy}</Text> : null}
      </View>

      <TextField
        label="Den faktiske pris i kr. (valgfri)"
        value={values.actualPrice}
        onChangeText={(t) => set("actualPrice", t)}
        error={errors.actualPrice}
        keyboardType="number-pad"
      />

      <Checkbox checked={values.lackedTransparency} onChange={(c) => set("lackedTransparency", c)} accessibilityLabel="Der manglede gennemsigtighed om prisen">
        <CheckboxText>Der manglede gennemsigtighed om prisen</CheckboxText>
      </Checkbox>
      {values.lackedTransparency ? (
        <TextField
          label="Hvad manglede? (valgfri)"
          value={values.transparencyComment}
          onChangeText={(t) => set("transparencyComment", t)}
          error={errors.transparencyComment}
          multiline
          maxLength={REVIEW_TEXT_LIMITS.comment}
        />
      ) : null}

      {submit.error ? <StatusMessage message={submit.error} tone="danger" /> : null}
      <Button label="Send anmeldelse" loading={submit.pending} onPress={() => void submit.run()} />
    </>
  );
}

// Anmeldelse af et gennemført besøg (architecture 8.2, 13.4). Kun patienter med en gennemført booking kan anmelde; serveren afgør det.
function ReviewContent() {
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const eligible = useLoad(listEligibleReviews);
  const [sent, setSent] = useState(false);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/bookinger"));

  return (
    <Screen>
      <BackLink label="Mine bookinger" onPress={back} />
      {sent ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            Tak for din anmeldelse
          </Text>
          <StatusMessage tone="success" message="Tak. Anmeldelsen vises som verificeret, når den er godkendt." />
          <Button label="Tilbage til bookinger" onPress={() => router.replace("/bookinger")} />
        </>
      ) : (
        <LoadState {...eligible} onRetry={eligible.reload}>
          {(items) => {
            const item = items.find((i) => i.bookingId === bookingId);
            if (!item) return <StatusMessage message={NOT_ELIGIBLE_TEXT} tone="warning" />;
            return (
              <>
                <Text accessibilityRole="header" style={styles.title}>
                  Anmeld dit besøg
                </Text>
                <ReviewForm item={item} onDone={() => setSent(true)} />
              </>
            );
          }}
        </LoadState>
      )}
    </Screen>
  );
}

export function ReviewScreen() {
  return (
    <AccountRequired title="Log ind for at skrive en anmeldelse">
      <ReviewContent />
    </AccountRequired>
  );
}

const styles = StyleSheet.create({
  title: type.screenTitle,
  heading: type.heading,
  body: { ...type.body, color: colors.ink },
  muted: type.caption,
  label: { ...type.caption, fontWeight: "600", color: colors.ink },
  error: { ...type.caption, color: colors.dangerInk },
  group: { gap: spacing.sm },
});
