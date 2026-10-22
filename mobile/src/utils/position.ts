import * as Location from "expo-location";
import { roundPosition } from "@/lib/common/domain/position";

export type Position = { lat: number; lng: number };

// Fejl med en dansk tekst, der kan vises direkte til patienten.
export class PositionError extends Error {}

const FAILED = "Vi kunne ikke få din position. Tjek tilladelsen i Indstillinger, eller skriv dit postnummer i stedet.";

// "Brug min position" (architecture 6.1, 13.5): positionen afrundes til ca. 1 km og gemmes aldrig.
export async function getRoundedPosition(): Promise<Position> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new PositionError(FAILED);
    const last = await Location.getLastKnownPositionAsync();
    const result = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: roundPosition(result.coords.latitude), lng: roundPosition(result.coords.longitude) };
  } catch (e) {
    throw e instanceof PositionError ? e : new PositionError(FAILED);
  }
}
