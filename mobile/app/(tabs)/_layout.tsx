import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ColorValue } from "react-native";
import { colors, iconSize } from "~/theme";

type IconName = keyof typeof Ionicons.glyphMap;

// Ikon pr. fane: fyldt, når fanen er aktiv, ellers omrids. Farven følger temaet.
function icon(active: IconName, inactive: IconName) {
  return ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={iconSize.md} color={color as string} />
  );
}

// Fire faner; labels er på dansk, og ikonerne er rigtige ikoner med temaets farver.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
        tabBarStyle: { backgroundColor: colors.canvas, borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Forside", tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen name="klinikker" options={{ title: "Klinikker", tabBarIcon: icon("location", "location-outline") }} />
      <Tabs.Screen name="sager" options={{ title: "Mine sager", tabBarIcon: icon("document-text", "document-text-outline") }} />
      <Tabs.Screen name="konto" options={{ title: "Konto", tabBarIcon: icon("person", "person-outline") }} />
    </Tabs>
  );
}
