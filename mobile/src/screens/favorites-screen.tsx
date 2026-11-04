import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { NO_FAVORITES_TEXT } from "@/lib/clinics/constants/favorites";
import type { ClinicListItemDto } from "@/lib/clinics/types/clinics";
import { getFavorites } from "~/api/favorites";
import { ClinicCard } from "~/components/clinic-directory/clinic-card";
import { FavoritePrompt } from "~/components/clinic-directory/favorite-prompt";
import { BackLink, LoadState, Screen, StatusMessage } from "~/components/ui";
import { useFavorites } from "~/hooks/use-favorites";
import { useLoad } from "~/hooks/use-load";
import { useReloadOnFocus } from "~/hooks/use-reload-on-focus";
import { AccountRequired } from "~/screens/account-required";
import { spacing, type } from "~/theme";

// Patientens gemte klinikker som oversigtens kort i navneorden (mobile 13.12, clinics 10.17). Hjertet fjerner klinikken igen.
function FavoritesContent() {
  const router = useRouter();
  const list = useLoad(getFavorites);
  useReloadOnFocus(list.reload);
  const favorites = useFavorites();
  const openProfile = (clinic: ClinicListItemDto) => router.push({ pathname: "/klinik/[clinicId]", params: { clinicId: clinic.id } });
  return (
    <Screen>
      <BackLink label="Konto" onPress={() => (router.canGoBack() ? router.back() : router.replace("/konto"))} />
      <Text accessibilityRole="header" style={type.screenTitle}>
        Gemte klinikker
      </Text>
      {favorites.error ? <StatusMessage message={favorites.error} tone="danger" /> : null}
      <LoadState {...list} onRetry={list.reload}>
        {(clinics) => {
          // Før id'erne er hentet vises alle; derefter kun dem, der stadig er gemt (et tryk på hjertet fjerner kortet med det samme).
          const shown = clinics.filter((clinic) => !favorites.loaded || favorites.isSaved(clinic.id));
          if (shown.length === 0) return <Text style={type.body}>{NO_FAVORITES_TEXT}</Text>;
          return (
            <View style={styles.list}>
              {shown.map((clinic) => (
                <ClinicCard
                  key={clinic.id}
                  clinic={clinic}
                  hasServices={false}
                  emergency={false}
                  onPress={() => openProfile(clinic)}
                  favorite={{ saved: !favorites.loaded || favorites.isSaved(clinic.id), onToggle: () => void favorites.toggle(clinic.id) }}
                />
              ))}
            </View>
          );
        }}
      </LoadState>
      <FavoritePrompt visible={favorites.promptOpen} onClose={favorites.closePrompt} />
    </Screen>
  );
}

export function FavoritesScreen() {
  return (
    <AccountRequired title="Log ind for at se dine gemte klinikker">
      <FavoritesContent />
    </AccountRequired>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.lg } });
