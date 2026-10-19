import { StyleSheet, Text, View } from "react-native";
import { MIN_REVIEWS_FOR_PRICE_ACCURACY, PRICE_ACCURACY_LABEL } from "@/lib/constants/reviews";
import type { PublicReviewDto, PublicReviewsDto } from "@/lib/types/reviews";
import { Badge } from "~/components/ui";
import { colors, fontSize, radius, spacing } from "~/theme";
import { formatKr, formatMonth, formatPercent } from "~/utils/format";
import { StarRating, Stars } from "./star-rating";

function ReviewItem({ review }: { review: PublicReviewDto }) {
  return (
    <View style={styles.item}>
      <View style={styles.meta}>
        <Stars stars={review.stars} />
        <Badge label="Verificeret besøg" />
        <Text style={styles.muted}>{formatMonth(review.createdMonth)}</Text>
      </View>
      <Text style={styles.text}>{review.text}</Text>
      <Text style={styles.muted}>
        <Text style={styles.strong}>Svarede prisen til prisoverslaget?</Text> {PRICE_ACCURACY_LABEL[review.priceAccuracy]}
        {review.actualPrice !== null ? ` · Faktisk pris: ${formatKr(review.actualPrice)}` : ""}
      </Text>
      {review.lackedTransparency ? (
        <Text style={styles.muted}>
          <Text style={styles.strong}>Manglede gennemsigtighed om prisen.</Text>
          {review.transparencyComment ? ` ${review.transparencyComment}` : ""}
        </Text>
      ) : null}
      {review.reply ? (
        <View style={styles.reply}>
          <Text style={styles.strong}>Svar fra klinikken</Text>
          <Text style={styles.text}>{review.reply.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

// Platformens egne anmeldelser (kun fra gennemførte besøg) med prisnøjagtighed. Trustpilot vises adskilt.
export function ReviewList({ data }: { data: PublicReviewsDto }) {
  const { stats, reviews } = data;
  if (stats.reviewCount === 0) return <Text style={styles.muted}>Der er endnu ingen verificerede anmeldelser på TandMatch.</Text>;
  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        {stats.avgStars !== null ? (
          <View>
            <StarRating value={stats.avgStars} count={stats.reviewCount} />
            <Text style={styles.muted}>Gennemsnit af verificerede anmeldelser</Text>
          </View>
        ) : null}
        {stats.priceAccuracyPct !== null ? (
          <View>
            <Text style={styles.strongLg}>Prisnøjagtighed {formatPercent(stats.priceAccuracyPct)}</Text>
            <Text style={styles.muted}>
              Andel af anmeldelserne, hvor den endelige pris svarede til prisoverslaget
              {stats.distribution
                ? ` (${stats.distribution.asQuoted} som oplyst, ${stats.distribution.slightlyHigher} lidt højere, ${stats.distribution.muchHigher} langt højere)`
                : ""}
              .
            </Text>
          </View>
        ) : (
          <Text style={styles.muted}>Prisnøjagtighed vises, når klinikken har mindst {MIN_REVIEWS_FOR_PRICE_ACCURACY} verificerede anmeldelser.</Text>
        )}
      </View>
      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
      <Text style={styles.muted}>
        Kun patienter, der har gennemført et besøg via TandMatch, kan anmelde. Anmeldelserne modereres, og klinikken kan svare offentligt.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  summary: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  item: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  reply: { backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md, gap: 2 },
  text: { fontSize: fontSize.md, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: fontSize.sm, color: colors.inkMuted },
  strong: { fontSize: fontSize.sm, fontWeight: "700", color: colors.ink },
  strongLg: { fontSize: fontSize.lg, fontWeight: "700", color: colors.ink },
});
