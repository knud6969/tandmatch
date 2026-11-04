import { Modal, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FAVORITE_ACCOUNT_TITLE } from "@/lib/clinics/constants/favorites";
import { Button, Card } from "~/components/ui";
import { spacing, type } from "~/theme";

type Props = { visible: boolean; onClose: () => void };

// Kortet uden konto: "Opret en konto for at gemme klinikker" med "Opret konto" og "Log ind" (mobile 13.12).
export function FavoritePrompt({ visible, onClose }: Props) {
  const router = useRouter();
  const go = (path: "/opret" | "/login") => {
    onClose();
    router.push(path);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card>
          <Text accessibilityRole="header" style={type.heading}>
            {FAVORITE_ACCOUNT_TITLE}
          </Text>
          <Button label="Opret konto" onPress={() => go("/opret")} />
          <Button label="Log ind" variant="secondary" onPress={() => go("/login")} />
          <Button label="Ikke nu" variant="text" onPress={onClose} />
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.4)" },
});
