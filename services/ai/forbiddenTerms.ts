// Filter for forbudt indhold (architecture 7.5, række 5), registrering af emner patienten spørger om (7.3)
// og detektion af akutte tegn (7.3). Filteret logger aldrig tekst: det returnerer kun kategorinavne.
// Dansk og engelsk. Ren fil uden server-imports, så den kan testes direkte.
//
// JS' \b og \w kender ikke æ, ø og å, så ordgrænser er lookarounds med \p{L}.

import type { OutOfScopeTopic } from "@/lib/types/ai";

export type ForbiddenCategory =
  | "price" // beløb, valuta, prisord. Gælder altid
  | "clinic_recommendation" // anbefaling, rangering eller omtale af bestemte klinikker. Gælder altid
  | "definitive" // endelige diagnoser, garantier, "du behøver ikke tandlæge". Gælder altid
  | "mdr_strict" // diagnose- og alvorlighedsord. Kun når rules.strictMdrMode er true
  | "assessment" // foreløbig vurdering i en tekst, hvor den ikke hører hjemme (opsummeringen)
  | "image_interpretation"; // fortolkning i billedfelter

const L = String.raw`\p{L}`;
const rx = (source: string) => new RegExp(source, "iu");
const word = (alternatives: string) => String.raw`(?<!${L})(?:${alternatives})(?!${L})`;

// ---------- Priser ----------
// OBS: "krone" er en behandling i kataloget (tandkrone) og er derfor ikke et prisord. Valuta kræver et tal.
const PRICE_PATTERNS: RegExp[] = [
  rx(String.raw`\d[\d.,\s]*\s*(kr\.?|kroner|dkk|euro|eur|,-)(?!${L})`),
  rx(word(String.raw`kr\.?|dkk|euro|usd`)),
  rx(String.raw`[€$£]`),
  rx(String.raw`${L}*pris(?:en|er|erne|et)?(?:overslag|interval|niveau|forskel|liste|tilbud|spænd)?(?!${L})`),
  rx(word(String.raw`koste|koster|kostede|kostet|kostende|kostpris|udgift|udgifter|omkostning|omkostninger|billig|billigt|billigere|billigst|dyr|dyrt|dyre|dyrere|dyrest|gratis|rabat|rabatter|betalingsplan`)),
  rx(String.raw`\d\s*tusind|(?<!${L})(omkring|ca\.?|cirka|knap|godt|mellem)\s+tusind`),
  rx(word(String.raw`price|prices|pricing|cost|costs|cheap|cheaper|expensive|fee|fees`)),
];

// Beløb i tal uden valuta. Punktum-tal som 3.000 tæller altid. Tal med 5+ cifre tæller. 3-4 cifre tæller med
// beløbskontekst ("ca. 5000") og i intervaller (3000-5000). Årstal og 4-cifrede postnumre tæller ikke alene.
const AMOUNT_BEFORE = /(ca\.?|cirka|omkring|godt|knap|over|under|mellem|pris\w*|koste\w*|beløb\w*)\s*$/i;
const AMOUNT_AFTER = /^\s*(kr|kroner|dkk|tusind|,-)/i;
const RANGE_AFTER = /^\s*[-–]\s*(\d{3,4})(?!\d)/;

function isYear(digits: string): boolean {
  return digits.length === 4 && Number(digits) >= 1900 && Number(digits) <= 2099;
}

export function containsAmount(text: string): boolean {
  const dotted = /(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d)/g;
  if (dotted.test(text)) return true;
  const plain = text.replace(/(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d)/g, "X");
  for (const m of plain.matchAll(/\d+/g)) {
    const digits = m[0];
    const start = m.index ?? 0;
    const end = start + digits.length;
    if (digits.length >= 5) return true;
    if (digits.length < 3) continue;
    const before = plain.slice(Math.max(0, start - 25), start);
    const after = plain.slice(end, end + 25);
    if (AMOUNT_AFTER.test(after) || AMOUNT_BEFORE.test(before)) return true;
    const range = RANGE_AFTER.exec(after);
    if (range && !(isYear(digits) && isYear(range[1]))) return true;
  }
  return false;
}

// ---------- Klinikanbefaling ----------
const CLINIC_NOUN = String.raw`(?:klinik|klinikker|klinikken|tandlæge|tandlæger|tandlægen|tandlægeklinik|tandlægehus|tandlægehuset)`;
const CLINIC_PATTERNS: RegExp[] = [
  rx(String.raw`(?<!${L})(bedste|bedre|dygtigste|dygtigere|førende|mest\s+erfarne|top|bedst\s+anmeldt|højest\s+rangeret)\s+(${L}+\s+)?${CLINIC_NOUN}`),
  rx(String.raw`${CLINIC_NOUN}\s+(${L}+\s+){0,2}(er|var|virker)\s+(${L}+\s+)?(bedst|bedre|bedste|god|godt|dårlig|dygtig|dygtigere|anbefalelsesværdig|at\s+foretrække)(?!${L})`),
  rx(String.raw`(anbefal${L}*|foreslå${L}*|vælg|vælge|kontakt|book|prøv)[^.!?\n]{0,40}(en\s+bestemt|denne|den\s+her|netop)\s+${CLINIC_NOUN}`),
  rx(String.raw`(anbefal${L}*|vælg|vælge)[^.!?\n]{0,25}(klinik|klinikker|klinikken)(?!${L})`),
  rx(String.raw`(vælg|vælge|kontakt|book)\s+(klinikken|tandlægen)\s+(med|der|som)`),
  rx(String.raw`${CLINIC_NOUN}\s+(med|der\s+har)\s+(de\s+)?(bedste|højeste|flest)`),
  rx(String.raw`(rang(?:ér|er)${L}*)`),
  rx(String.raw`(?<!${L})(trustpilot)[^.!?\n]{0,30}(bedst|højest|flest)`),
];
// Klinikker med egennavn ("Tandlægehuset Vesterbro", "Dental ApS"). Kræver stort bogstav, så ikke case-insensitiv.
const CLINIC_NAME_PATTERN = new RegExp(
  String.raw`(?<!\p{L})(Tandlægerne|Tandlægehuset|Tandlægeklinikken|Tandklinikken|Tandklinik|Dental|Tandlæge)\s+\p{Lu}\p{Ll}+`,
  "u",
);

// ---------- Endelige udsagn ----------
const DEFINITIVE_PATTERNS: RegExp[] = [
  rx(String.raw`helt\s+sikkert|uden\s+tvivl|(?<!${L})100\s*%|garanti|garanter${L}*`),
  rx(String.raw`du\s+har\s+(helt\s+)?(klart\s+|bestemt\s+|med\s+sikkerhed\s+)?(et\s+hul|en\s+infektion|en\s+betændelse|karies|paradentose|tandsten|en\s+cyste|et\s+abces)`),
  rx(String.raw`(behøver|skal)\s+(du\s+)?ikke\s+(at\s+)?(gå\s+til\s+|se\s+|kontakte\s+|opsøge\s+)?(en\s+)?tandlæge`),
  rx(String.raw`ingen\s+grund\s+til\s+(at\s+)?(kontakte|gå\s+til|se|opsøge)\s+(en\s+)?tandlæge`),
  rx(String.raw`(?<!${L})(jeg\s+er\s+tandlæge|som\s+tandlæge)`),
  rx(String.raw`(det\s+kan\s+(sagtens\s+)?vente|er\s+ufarligt|er\s+ufarlig|intet\s+at\s+bekymre)`),
];

// ---------- Strenge MDR-ord (kun når rules.strictMdrMode) ----------
// MDR-TILPASNING: listen aktiveres af strictMdrMode i rules.ts. Den er diagnose- og alvorlighedsordene fra den tidligere model.
export const mdrStrictTerms: RegExp[] = [
  rx(String.raw`karies|caries|paradentos|parodont|periodont|gingivit|pulpit|abces|infektion|inflammation|betænd|sygdom|diagnos|(?:(?<!${L})|(?<=tand|rod))revn|fraktur|overbid|underbid|malokklusion|bidfejl|nerveskade|rodspids|cyste|tandsten|plaque`),
  rx(String.raw`alvorlig|severe|severity|urgent|kritisk|slemt|farlig|ufarlig|usund|unormal|skadet|bekymrende|erosion|misfarv`),
  rx(String.raw`pege?r?\s+på|tyder\s+på|kan\s+skyldes|kan\s+være\s+tegn|sandsynlig|formentlig|muligvis`),
];

// ---------- Vurdering i en tekst, hvor den ikke hører hjemme (opsummeringen) ----------
const ASSESSMENT_PATTERNS: RegExp[] = [
  rx(String.raw`foreløbig\s+vurdering|kan\s+pege\s+på|peger\s+på|tyder\s+på|kan\s+skyldes|kan\s+være\s+tegn\s+på|ligner\s+(en|et|tegn)|sandsynligvis|formentlig|det\s+kan\s+være\s+(karies|en\s+infektion|betændelse)`),
];

// ---------- Fortolkning i billedfelter ----------
const IMAGE_INTERPRETATION_PATTERNS: RegExp[] = [
  rx(String.raw`karies|caries|hul\b|huller|infektion|betænd|abces|revn|knæk|skade|ødelagt|rådden|dårlig|sund|usund|slid|slidt|erosion|misfarv|plak|tandsten|paradentos|alvorlig|bekymr|problem|ser\s+ud\s+til|tyder|ligner|muligvis|sandsynlig|formentlig|normal|unormal|skæv`),
];

const PATTERNS: Record<Exclude<ForbiddenCategory, "mdr_strict">, RegExp[]> = {
  price: PRICE_PATTERNS,
  clinic_recommendation: CLINIC_PATTERNS,
  definitive: DEFINITIVE_PATTERNS,
  assessment: ASSESSMENT_PATTERNS,
  image_interpretation: IMAGE_INTERPRETATION_PATTERNS,
};

export type FilterOptions = {
  // Kategorier der kontrolleres. Standard: price, clinic_recommendation, definitive.
  categories?: readonly ForbiddenCategory[];
  strictMdrMode?: boolean;
  // Hele ord (og tal) der må gentages, fordi patienten selv skrev dem (kun opsummering). Fjernes før kontrol.
  allowTerms?: readonly string[];
};

const DEFAULT_CATEGORIES: readonly ForbiddenCategory[] = ["price", "clinic_recommendation", "definitive"];

function removeWholeWord(text: string, term: string): string {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, "giu"), " ");
}

// Returnerer kategorierne for forbudt indhold (tom liste = tilladt).
export function findForbiddenCategories(text: string, options: FilterOptions = {}): ForbiddenCategory[] {
  const categories = new Set<ForbiddenCategory>(options.categories ?? DEFAULT_CATEGORIES);
  if (options.strictMdrMode) categories.add("mdr_strict");

  let cleaned = text.toLowerCase();
  for (const term of options.allowTerms ?? []) {
    if (term.length >= 2) cleaned = removeWholeWord(cleaned, term);
  }

  const hits: ForbiddenCategory[] = [];
  for (const category of categories) {
    const patterns = category === "mdr_strict" ? mdrStrictTerms : PATTERNS[category];
    let hit = patterns.some((p) => p.test(cleaned));
    if (category === "price" && !hit) hit = containsAmount(cleaned);
    if (category === "clinic_recommendation" && !hit) hit = CLINIC_NAME_PATTERN.test(text);
    if (hit) hits.push(category);
  }
  return hits;
}

// ---------- Foreløbig vurdering: formulering ----------
// En vurdering skal være foreløbig (forbehold) og pege på klinikkens endelige vurdering.
const HEDGE = rx(word(String.raw`kan|kunne|måske|muligt|muligvis|eventuelt|foreløbig|foreløbigt|peger|tyder|ligner|sandsynligvis`));
const DEFERS_TO_CLINIC = rx(word(String.raw`klinikken|klinikkens|tandlægen|tandlægens`));

export function isPhrasedAsPreliminary(assessment: string): boolean {
  return HEDGE.test(assessment) && DEFERS_TO_CLINIC.test(assessment) && !DEFINITIVE_PATTERNS.some((p) => p.test(assessment));
}

// ---------- Emner patienten spørger om ----------
const TOPIC_PATTERNS: { topic: OutOfScopeTopic; pattern: RegExp }[] = [
  {
    topic: "price",
    pattern: rx(String.raw`hvad\s+koster|koster\s+(det|den|de)|hvor\s+meget\s+(koster|skal\s+jeg\s+betale)|hvad\s+ville\s+det\s+koste|${L}*pris(?:en|er|erne)?(?!${L})|hvor\s+dyrt|billig|dyr(?!${L})|(?<!${L})kr(?!${L})|kroner|how\s+much|(?<!${L})cost`),
  },
  {
    topic: "clinic_recommendation",
    pattern: rx(String.raw`(hvilken|hvilke)\s+(${L}+\s+)?(klinik|tandlæge)|(bedste|bedre|dygtigste|billigste)\s+(${L}+\s+)?(klinik|tandlæge)|anbefal${L}*\s+(du\s+|i\s+)?(en\s+|nogen\s+)?(${L}+\s+)?(klinik|tandlæge)|er\s+(klinik|tandlæge)\w*\s+\p{L}+\s+(god|dygtig)|which\s+(clinic|dentist)|best\s+(clinic|dentist)`),
  },
];

export function detectOutOfScopeTopics(text: string, blocked: readonly OutOfScopeTopic[] = ["price", "clinic_recommendation"]): OutOfScopeTopic[] {
  return TOPIC_PATTERNS.filter((t) => blocked.includes(t.topic) && t.pattern.test(text)).map((t) => t.topic);
}

export function mergeTopics(...lists: readonly (readonly OutOfScopeTopic[])[]): OutOfScopeTopic[] {
  const all = new Set(lists.flat());
  return (["price", "clinic_recommendation"] as const).filter((t) => all.has(t));
}

// ---------- Akutte tegn i patientens tekst ----------
// Sikkerhedsnet oven på modellens eget emergency-flag: gælder uanset AI-regler og MDR (architecture 7.3).
// Bevidst bred: en falsk alarm koster en ekstra henvisning, en overset akut sag koster mere.
const NEGATED_SYMPTOM = rx(String.raw`(ingen|uden|ikke|ingen\s+tegn\s+på)\s+(${L}+\s+)?(feber|hævelse|hævet|blødning|smerter|ondt)`);
const EMERGENCY_PATTERNS: RegExp[] = [
  rx(String.raw`(stærke?|voldsomme?|kraftige?|slemme?|uudholdelige?|ulidelige?|frygtelige?|enorme?|vildt|rigtig\s+mange)\s+(${L}+\s+)?(smerte${L}*|ondt)`),
  rx(String.raw`(kan\s+ikke\s+sove|vågner)[^.!?\n]{0,30}(smerte${L}*|ondt)`),
  rx(String.raw`hæve${L}*|hævet`),
  rx(String.raw`feber|høj\s+temperatur`),
  rx(String.raw`blød${L}*[^.!?\n]{0,40}(stopper\s+ikke|ikke\s+stoppe|vil\s+ikke\s+stoppe|kraftig|meget|ophører\s+ikke)|(stopper|ophører)\s+ikke[^.!?\n]{0,30}blød`),
  rx(String.raw`traume|ulykke|slået\s+(en\s+|min\s+|mine\s+)?(tand|tænder)|tand\w*\s+(er\s+)?(slået|røget|faldet)\s+ud|(fik|har\s+fået)\s+(et\s+)?(slag|stød)|slag\s+(i|mod|på)\s+(munden|kæben|ansigtet)|faldet\s+(og|på)|knækket\s+(efter|pga|på\s+grund\s+af)`),
  rx(String.raw`(svært|problemer)\s+ved\s+(at\s+)?(trække\s+vejret|synke|sluge)|vejrtræknings${L}*|kan\s+ikke\s+synke`),
  rx(String.raw`(kan\s+ikke|svært\s+at)\s+(åbne|spærre)\s+(munden|op)`),
];
const LIFE_THREATENING_PATTERNS: RegExp[] = [
  rx(String.raw`(svært|problemer)\s+ved\s+(at\s+)?(trække\s+vejret|synke|sluge)|vejrtræknings${L}*|kan\s+ikke\s+synke|kan\s+ikke\s+trække\s+vejret`),
  rx(String.raw`hæve${L}*[^.!?\n]{0,30}(hals|ansigt|øje|tunge)|(hals|ansigt|tunge)[^.!?\n]{0,30}hæve${L}*`),
];

export type EmergencyDetection = { emergency: boolean; lifeThreatening: boolean };

export function detectEmergency(text: string): EmergencyDetection {
  const cleaned = text.toLowerCase().replace(new RegExp(NEGATED_SYMPTOM.source, "giu"), " ");
  const emergency = EMERGENCY_PATTERNS.some((p) => p.test(cleaned));
  const lifeThreatening = LIFE_THREATENING_PATTERNS.some((p) => p.test(cleaned));
  return { emergency: emergency || lifeThreatening, lifeThreatening };
}

// Ord (3+ tegn) i patientens egen tekst, som må gentages i opsummeringen (allowTerms). Tal medtages.
export function wordsOf(text: string, minLength = 2): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\d]+(?:[.,][\d]+)*/gu) ?? [];
  return [...new Set(matches.filter((w) => w.length >= minLength))];
}
