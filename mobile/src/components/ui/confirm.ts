import { Alert } from "react-native";

type Options = { title: string; message: string; confirmLabel: string; onConfirm: () => void; destructive?: boolean };

// Bekræftelse før en handling, der ikke kan fortrydes. "Annuller" er den sikre vej og står først.
export function confirmAction({ title, message, confirmLabel, onConfirm, destructive = true }: Options) {
  Alert.alert(title, message, [
    { text: "Annuller", style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
