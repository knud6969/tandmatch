import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { colors } from "~/theme";

function icon(symbol: string) {
  // Enkle tegn i stedet for et ikonbibliotek (ingen ekstra pakker i skelettet).
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{symbol}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand700,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Forside", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="klinikker" options={{ title: "Klinikker", tabBarIcon: icon("⚲") }} />
      <Tabs.Screen name="sager" options={{ title: "Mine sager", tabBarIcon: icon("☰") }} />
      <Tabs.Screen name="konto" options={{ title: "Konto", tabBarIcon: icon("☺") }} />
    </Tabs>
  );
}
