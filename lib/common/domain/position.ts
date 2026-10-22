// Position rundes til to decimaler (ca. 1 km) før den sendes som lat/lng. Den gemmes ikke (architecture 10.7).
export function roundPosition(value: number): number {
  return Math.round(value * 100) / 100;
}
