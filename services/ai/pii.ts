// Maskering af personoplysninger før tekst sendes til OpenAI eller gemmes (architecture 7.2).
// Ren funktion uden server-imports, så den kan testes direkte.
// Maskeret tekst bliver aldrig længere end originalen (en kort personoplysning erstattes af lige så mange stjerner),
// så beskedloftet på 1000 tegn ikke rammes efter AI-kaldet.
// Maskeringen er et sikkerhedsnet: UI beder patienten om ikke at skrive personoplysninger (lib/constants/ai-texts.ts).

export const PII_MASK = "[fjernet]";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CPR = /\b\d{6}-?\d{4}\b/g;
const PHONE = /(?:\+\s?45[\s-]?)?\b\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b/g;

// Vejnavn + husnummer: "Nørrebrogade 12", "Vester Voldgade 7B", "Nørrebrogade 12, 2. th".
const STREET_SUFFIX =
  "vej|gade|allé|alle|plads|stræde|boulevard|torv|vænge|bakke|løkke|promenade|kvarter|engen|marken|parken|havn|bro|gårdsvej";
// Etage og side: "12 st tv", "12, 2. th", "12 3. sal".
const FLOOR = String.raw`(?:,?\s*(?:\d{1,2}\.?\s*(?:sal\b\.?)?\s*)?(?:[Ss]t|[Tt]h|[Tt]v|[Mm]f)\b\.?(?:\s+(?:[Tt]h|[Tt]v|[Mm]f)\b\.?)?)?`;
// Uden i-flag, så \p{Lu} kun rammer store bogstaver og "bor på" ikke tages med som en del af vejnavnet.
const STREET = new RegExp(
  String.raw`(?:\p{Lu}[\p{L}.'-]*\s+){0,2}\p{L}{2,}(?:${STREET_SUFFIX})(?:en|n)?\s+\d{1,4}\s?[A-Za-z]?(?![\p{L}\d])${FLOOR}`,
  "gu",
);

// Postnummer + by: "2200 København N". Årstal må ikke maskeres, så ord foran, der peger på en tid, springes over.
const POSTAL = /(?<![\d.])(\d{4})\s+(\p{Lu}\p{Ll}{2,}(?:\s+(?:[NVSKCØ]|NV|SV)(?![\p{L}\d]))?)/gu;
const YEAR_CONTEXT = /(?:^|\s)(?:i|siden|fra|før|efter|omkring|ca\.?|cirka|år|til|indtil|sidst|medio|primo|ultimo|den|engang|tilbage)\s*$/i;

// Navneudsagn: "Jeg hedder Knud Aundal", "mit navn er knud", "my name is Anna Hansen".
const NAME_LEAD = /(jeg\s+hedder|mit\s+navn\s+er|mit\s+fulde\s+navn\s+er|my\s+name\s+is|i\s+am\s+called)(\s+)([\p{L}'-]+(?:\s+[\p{L}'-]+){0,2})/giu;
// "Jeg er Knud Aundal": kun med to navne med stort begyndelsesbogstav, ellers rammes almindelige sætninger.
const NAME_JEG_ER = /((?:^|[.!?]\s+)[Jj]eg\s+er)(\s+)(\p{Lu}[\p{L}'-]+\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?)/gu;
// "hedder" alene kræver stort begyndelsesbogstav ("… og hedder Mette"), ellers rammes "hvad hedder behandlingen".
const NAME_HEDDER = /((?:^|\s)hedder)(\s+)(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,2})/gu;
// Underskrift: "Hilsen Knud Aundal", "Mvh Knud".
const NAME_SIGNATURE = /((?:[Mm]ed\s+)?(?:[Vv]enlig(?:\s+|\s)?[Hh]ilsen|[Hh]ilsen|[Mm]vh\.?|[Kk]ærlig\s+hilsen|[Bb]est\s+regards|[Rr]egards),?)(\s+)(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+){0,2})/gu;
// Præsentation bagfra: "Knud Aundal her".
const NAME_HER = /(?<![\p{L}])(\p{Lu}[\p{L}'-]+\s+\p{Lu}[\p{L}'-]+)(\s+her)(?![\p{L}])/gu;
// Skjult e-mail: "knud at gmail dot com", "knud (at) gmail (dot) com".
const EMAIL_SPELLED = /[A-Za-z0-9._%+-]+\s*(?:\(at\)|\[at\]|\s+at\s+|\s+snabel-?a\s+)\s*[A-Za-z0-9-]+\s*(?:\(dot\)|\[dot\]|\s+dot\s+|\s+punktum\s+|\s+prik\s+)\s*[A-Za-z]{2,}/gi;

const NAME_STOPWORDS = new Set([
  "og", "jeg", "har", "bor", "er", "vil", "men", "at", "som", "der", "det", "min", "mit", "mine", "en", "et", "på", "i", "og",
  "and", "i", "my", "have", "am", "is", "the",
]);

function mask(segment: string): string {
  return segment.length >= PII_MASK.length ? PII_MASK : "*".repeat(segment.length);
}

function maskName(_match: string, lead: string, space: string, name: string): string {
  const parts = name.split(/(\s+)/); // ord og mellemrum skiftevis
  let words = 0;
  while (words * 2 < parts.length && !NAME_STOPWORDS.has(parts[words * 2].toLowerCase())) words++;
  if (words === 0) return `${lead}${space}${name}`;
  const split = words * 2 - 1;
  return `${lead}${space}${mask(parts.slice(0, split).join(""))}${parts.slice(split).join("")}`;
}

function maskPostal(match: string, digits: string, _city: string, offset: number, whole: string): string {
  const before = whole.slice(Math.max(0, offset - 20), offset);
  const yearLike = Number(digits) >= 1900 && Number(digits) <= 2099;
  const livesThere = /bor\s+(?:i|på)\s*$/i.test(before) || /,\s*$/.test(before) || before.endsWith(PII_MASK + " ");
  if (yearLike && YEAR_CONTEXT.test(before) && !livesThere) return match;
  return mask(match);
}

export function maskPii(text: string): string {
  return text
    .replace(EMAIL, mask)
    .replace(EMAIL_SPELLED, mask)
    .replace(CPR, mask)
    .replace(STREET, mask)
    .replace(POSTAL, maskPostal)
    .replace(PHONE, mask)
    .replace(NAME_LEAD, maskName)
    .replace(NAME_JEG_ER, maskName)
    .replace(NAME_HEDDER, maskName)
    .replace(NAME_SIGNATURE, maskName)
    .replace(NAME_HER, (_m: string, name: string, her: string) => `${mask(name)}${her}`);
}
