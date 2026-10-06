// Forbudt-indhold-filter (architecture 7.5, række 5) og registrering af emner, patienten spørger om (7.3).
// Filteret logger aldrig tekst. Det returnerer kun kategorinavne.
// Listen er dansk og engelsk og vedligeholdes af ai-flow-agenten.
// Ren funktion uden server-imports, så den kan testes direkte.

import type { OutOfScopeTopic } from "@/lib/types/ai";

type ForbiddenCategory =
  | "price"
  | "diagnosis"
  | "severity"
  | "treatment"
  | "probability"
  | "evaluation"
  | "role";

type Rule = { category: ForbiddenCategory; pattern: RegExp };

// Kategoriord (kategorinavne og deres sprogbrug) er IKKE forbudte. Patientens ord om det kosmetiske ønske
// og kategorinavnene må gentages. Listen bruges i testene (tests/ai/guardrails.test.ts).
export const CATEGORY_WORDS = [
  "mellemrum", "placering", "facader", "facader (skaller)", "facings", "facing", "skaller",
  "blegning", "blegn", "retainer", "andet kosmetisk ønske", "kosmetisk ønske", "farve", "form",
];

// Mønstrene er stammer uden \b foran, så sammensatte ord fanges (tandkødsbetændelse, rodbetændelse).
// De rammer modellens egne formuleringer. Patientens ord håndteres via allowTerms (se isEchoableWord).
const TREAT_WORD = String.raw`(behandl|blegn|facade|facing|tandkrone|krone|implantat|retainer|bonding|regulering|veneer|fyldning|udtræk|rodbehandl|operation|kirurgi)`;
const LOESE = String.raw`(kunne|kan|vil|skal|bør)?\s*løs(e|er|ning|es)`;

const RULES: Rule[] = [
  // Beløb og valuta. "pris" dækker prisen, prisoverslag, priser osv.
  { category: "price", pattern: /\d[\d.,\s]*\s*(kr\.?|kroner|dkk|,-)/i },
  // "kr" alene, og "tusind" i kombination med tal eller en mængdeangivelse (omkring 3 tusind, 3 tusinde).
  { category: "price", pattern: /(?<![a-zæøå])kr\.?(?![a-zæøå])/i },
  { category: "price", pattern: /(\d\s*tusind|\b(omkring|ca\.?|cirka|knap|godt|mellem)\s+tusind)/i },
  {
    category: "price",
    pattern: /(pris|koste|kostet|kostnad|kostpris|billig|dyrt|dyrere|dyrest|\bkroner\b|\bkrone\b|\bdkk\b|\beuro\b|[€$£])/i,
  },
  // Diagnose- og tilstandsord
  {
    category: "diagnosis",
    pattern: /(karies|caries|paradentos|parodont|periodont|gingivit|pulpit|abces|infektion|inflammation|betænd|sygdom|diagnos|\brevn|knæk|fraktur|overbid|underbid|malokklusion|bidfejl|nerveskade|rodspids|cyste|lyder\s+som\s+(et\s+)?hul|hul\s+i\s+tand|har\s+(et|en)\s+(hul|cyste|infektion|betændelse|abces))/i,
  },
  // Alvorlighed og hast
  // "akut" blokeres kun, når det bruges som vurdering ("er akut", "ser akut ud"). Omtale af det akutte spor er tilladt.
  {
    category: "severity",
    pattern: /(alvorlig|severe|severity|mild|hastende|urgent|kritisk|slemt|haster\s+ikke|ufarlig|farlig|kan\s+vente|\b(er|ser|virker)\s+(\w+\s+){0,2}?akut)/i,
  },
  // Behandlingsforslag og egnethed (ikke kategoriord som blegning, facing, retainer)
  {
    category: "treatment",
    pattern: /(anbefal|du\s+(bør|burde)\s+(få|have)|bør\s+(du\s+)?(få|have|vælge)|du\s+skal\s+have|du\s+har\s+brug\s+for|er\s+nødvendig|\b(u?egnet|egnethed)|løses\s+med|kan\s+løses|behandling\s+af|behandlingsforslag|behandlingsplan|rodbehandling|udtræk|implantat|tandkrone|tandregulering|bonding|veneer|invisalign|facade\s+ville|fyldning|treatment|treat)/i,
  },
  // Behandlingsord kombineret med at løse noget ("kunne løse", "kan løse det"). "overvej blegning" er tilladt.
  {
    category: "treatment",
    pattern: new RegExp(
      String.raw`${TREAT_WORD}[^.!?\n]{0,60}\b${LOESE}|\b${LOESE}[^.!?\n]{0,60}${TREAT_WORD}`,
      "i",
    ),
  },
  // Sandsynlighed og fortolkning
  {
    category: "probability",
    pattern: /(sandsynlig|muligvis|formentlig|tyder\s+på|typisk\s+for|ligner|ser\s+ud\s+til|ser\s+ud\s+som|likely|probably)/i,
  },
  // Vurdering af tilstand (normalitet, sundhed, problem, slid, misfarvning)
  {
    category: "evaluation",
    pattern: /(normal|unormal|sund|usund|skadet|skade|problem|dårlig|ubehag|bekymr|recommend|slid|erosion|misfarv)/i,
  },
  // Roller og manipulation
  { category: "role", pattern: /(jeg\s+er\s+tandlæge|som\s+tandlæge|jeg\s+anbefaler|jeg\s+mener)/i },
];

// Beløb i tal uden valuta. Tusindtalsseparator (3.000), tal med 5+ cifre, 3-4 cifre med beløbskontekst
// ("ca. 5000", "5000 kr"), og intervaller (3000-5000). Årstal (1900-2099) og 4-cifrede postnumre tælles ikke med.
const AMOUNT_BEFORE = /(ca\.?|cirka|omkring|godt|knap|over|under|mellem|pris\w*|koste\w*|beløb\w*)\s*$/i;
const AMOUNT_AFTER = /^\s*(kr|kroner|dkk|tusind|,-)/i;
const RANGE_AFTER = /^\s*[-–]\s*(\d{3,4})(?!\d)/;

function isYear(digits: string): boolean {
  return digits.length === 4 && Number(digits) >= 1900 && Number(digits) <= 2099;
}

export function containsAmount(text: string): boolean {
  if (/\d{1,3}(\.\d{3})+/.test(text)) return true;
  for (const m of text.matchAll(/\d+/g)) {
    const digits = m[0];
    const start = m.index ?? 0;
    const end = start + digits.length;
    if (digits.length >= 5) return true;
    if (digits.length < 3) continue;
    const before = text.slice(Math.max(0, start - 25), start);
    const after = text.slice(end, end + 25);
    if (AMOUNT_AFTER.test(after) || AMOUNT_BEFORE.test(before)) return true;
    const range = RANGE_AFTER.exec(after);
    if (range && !(isYear(digits) && isYear(range[1]))) return true;
  }
  return false;
}

// Ord (4+ bogstaver) der må gentages fra patientens egen tekst eller kategori. Bruges kun for chat og patientord i opsummering.
export function wordsOf(text: string, minLength = 4): string[] {
  const matches = text.toLowerCase().match(/[a-zæøå]+/g) ?? [];
  return [...new Set(matches.filter((w) => w.length >= minLength))];
}

// Et patientord må gentages af modellen kun, hvis det ikke rammer nogen kategori. Vurderingsord ("normalt", "skadet",
// "misfarvning") og emner (diagnose, alvorlighed, pris, behandling, rolle) er aldrig tilladt at gentage. Ellers kan
// modellen svare "Det er normalt" på "er det normalt?", og patientens spørgsmål bliver til et svar.
export function isEchoableWord(word: string): boolean {
  return findForbiddenCategories(word).length === 0;
}

function removeWholeWord(text: string, term: string): string {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![a-zæøå])${escaped}(?![a-zæøå])`, "giu"), " ");
}

// Returnerer kategorier for forbudt indhold. allowTerms fjernes først, men kun som hele ord.
// Delstrenge fjernes ikke, så "alvor" ikke kan fjerne en del af "alvorlig".
export function findForbiddenCategories(text: string, allowTerms: string[] = []): ForbiddenCategory[] {
  let cleaned = text.toLowerCase();
  for (const term of allowTerms) {
    if (term.length >= 4) cleaned = removeWholeWord(cleaned, term);
  }
  const hits: ForbiddenCategory[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(cleaned) && !hits.includes(rule.category)) hits.push(rule.category);
  }
  if (containsAmount(cleaned) && !hits.includes("price")) hits.push("price");
  return hits;
}

// Dansk og engelsk. Registrerer emner i patientens tekst, så de vises som "tandlægens opgave".
const OUT_OF_SCOPE_PATTERNS: { topic: OutOfScopeTopic; pattern: RegExp }[] = [
  {
    topic: "price",
    pattern: /(hvad\s+koster|koster\s+det|hvor\s+meget\s+koster|hvad\s+ville\s+det\s+koste|\bpris(en|er)?\b|hvor\s+dyrt|billig|dyr\b|kroner|\bkr\b|how\s+much|cost)/i,
  },
  {
    topic: "diagnosis",
    pattern: /(er\s+det\s+(karies|en\s+infektion|betændelse|paradentose)|har\s+jeg\s+(karies|paradentose|en\s+infektion|betændelse)|hvad\s+fejler|diagnos|is\s+it\s+caries)/i,
  },
  {
    topic: "severity",
    pattern: /(er\s+det\s+(alvorligt|akut|slemt)|hvor\s+slemt|hvor\s+alvorlig|skal\s+jeg\s+(skynde|komme\s+hurtigt)|hastende|how\s+serious)/i,
  },
  {
    topic: "treatment",
    pattern: /(hvad\s+skal\s+jeg\s+have|hvad\s+(ville|vil|kan)\s+du\s+(gøre|anbefale)|hvilken\s+behandling|hvad\s+(bør|burde)\s+jeg|hvad\s+kan\s+i\s+gøre|anbefal|what\s+should\s+i\s+do|treatment)/i,
  },
];

export function detectOutOfScopeTopics(text: string): OutOfScopeTopic[] {
  return OUT_OF_SCOPE_PATTERNS.filter((rule) => rule.pattern.test(text)).map((rule) => rule.topic);
}

export function mergeTopics(...lists: OutOfScopeTopic[][]): OutOfScopeTopic[] {
  const order: OutOfScopeTopic[] = ["diagnosis", "severity", "treatment", "price"];
  const all = new Set(lists.flat());
  return order.filter((topic) => all.has(topic));
}
