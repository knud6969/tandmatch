const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Er værdien et uuid? Bruges på ?sag= og ?klinikker= fra adressen, som kan være redigeret.
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
