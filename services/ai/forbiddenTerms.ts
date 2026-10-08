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
  | "selfcare"
  | "role";

// inQuestions: reglen gælder også for spørgsmålssætninger (der slutter med "?").
type Rule = { category: ForbiddenCategory; pattern: RegExp; inQuestions?: boolean };

// Kategoriord (kategorinavne og deres sprogbrug) er IKKE forbudte. Patientens ord om det kosmetiske ønske
// og kategorinavnene må gentages. Listen bruges i testene (tests/ai/guardrails.test.ts).
export const CATEGORY_WORDS = [
  "mellemrum", "placering", "facader", "facader (skaller)", "facings", "facing", "skaller",
  "blegning", "blegn", "retainer", "andet kosmetisk ønske", "kosmetisk ønske", "farve", "form",
];

// Mønstrene er stammer og bruger flaget u. JS' \b og \w kender ikke æ, ø og å, så ordgrænser er
// lookarounds med \p{L}. Stammer uden præfiks-grænse fanger sammensatte ord (tandkødsbetændelse, rodbetændelse).
const L = String.raw`\p{L}`;
const COPULA = String.raw`(?<!${L})(ser|virker|lyder|er|var|være|kan\s+være|kunne\s+være)(?!${L})`;
// Betingelse ("Hvis det er akut", "når det er akut") er ikke en vurdering og rammes ikke.
const CONDITIONAL = String.raw`(?<!(?<!${L})(hvis|når|om|hvorvidt)\s+(${L}+\s+)?)`;
const AKUT = String.raw`${CONDITIONAL}${COPULA}\s+(${L}+\s+){0,3}?akut${L}*(?!\s+(spor|forløb))`;
const TREAT_WORD = String.raw`(behandl|blegn|facade|facing|tandkrone|krone|implantat|retainer|bonding|regulering|veneer|fyldning|udtræk|rodbehandl|operation|kirurgi)`;
const LOESE = String.raw`(kunne|kan|vil|skal|bør)?\s*(?<!${L})løs(e|er|ning|es)`;

const rx = (source: string) => new RegExp(source, "iu");

const RULES: Rule[] = [
  // Beløb og valuta. "pris" dækker prisen, prisoverslag, priser osv.
  { category: "price", pattern: rx(String.raw`\d[\d.,\s]*\s*(kr\.?|kroner|dkk|,-)`), inQuestions: true },
  { category: "price", pattern: rx(String.raw`(?<!${L})kr\.?(?!${L})`), inQuestions: true },
  // Kvalitative vendinger om omkostningen (udgift, omkostning).
  { category: "price", pattern: rx(String.raw`udgift|omkostning`), inQuestions: true },
  { category: "price", pattern: rx(String.raw`\d\s*tusind|(?<!${L})(omkring|ca\.?|cirka|knap|godt|mellem)\s+tusind`), inQuestions: true },
  {
    category: "price",
    pattern: rx(String.raw`pris|koste|kostet|kostnad|kostpris|billig|dyrt|dyrere|dyrest|(?<!${L})krone(r)?(?!${L})|(?<!${L})dkk(?!${L})|(?<!${L})euro(?!${L})|[€$£]`),
    inQuestions: true,
  },
  // Diagnose- og tilstandsord. "revn" og "plak" kræver ordstart eller sammensat led, så "beskrevne" og "plakat" ikke rammes.
  {
    category: "diagnosis",
    pattern: rx(String.raw`karies|caries|paradentos|parodont|periodont|gingivit|pulpit|abces|infektion|inflammation|betænd|sygdom|diagnos|(?:(?<!${L})|(?<=tand|rod))revn|knæk|fraktur|overbid|underbid|malokklusion|bidfejl|nerveskade|rodspids|cyste|lyder\s+som\s+(et\s+)?hul|hul\s+i\s+tand|tandsten|(?:(?<!${L})|(?<=tand))plak(?!${L})|plaque|har\s+(et|en)\s+(hul|cyste|infektion|betændelse|abces)`),
  },
  // Alvorlighed og hast. Akut rammes kun som vurdering af tilstanden, ikke omtale af det akutte spor.
  {
    category: "severity",
    pattern: rx(String.raw`alvorlig|severe|severity|mild|hast|urgent|kritisk|slemt|ufarlig|farlig|kan\s+vente|intet\s+at\s+tænke\s+på|søg\s+(${L}+\s+){0,2}tandlæge\s+(i\s+dag|hurtigst|snarest|hurtigt)|kontakt\s+(${L}+\s+){0,2}tandlæge\s+(i\s+dag|hurtigst|snarest|hurtigt)|vagttandlæg${L}*|skadestue${L}*|${AKUT}`),
  },
  // Behandlingsforslag og egnethed (ikke kategoriord som blegning, facing, retainer)
  {
    category: "treatment",
    pattern: rx(String.raw`anbefal|du\s+(bør|burde)\s+(få|have)|bør\s+(du\s+)?(få|have|vælge)|du\s+skal\s+have|du\s+har\s+brug\s+for|er\s+nødvendig|(?<!${L})u?egnet|egnethed|løses\s+med|kan\s+løses|behandling\s+af|behandlingsforslag|behandlingsplan|rodbehandling|udtræk|implantat|tandkrone|tandregulering|bonding|veneer|invisalign|facade\s+ville|fyldning|treatment|treat`),
    inQuestions: true,
  },
  // Behandlingsord kombineret med at løse noget ("kunne løse", "kan løse det"). "overvej blegning" er tilladt.
  {
    category: "treatment",
    pattern: rx(String.raw`${TREAT_WORD}[^.!?\n]{0,60}(?<!${L})${LOESE}|(?<!${L})${LOESE}[^.!?\n]{0,60}${TREAT_WORD}`),
    inQuestions: true,
  },
  // Sandsynlighed og fortolkning
  {
    category: "probability",
    pattern: rx(String.raw`sandsynlig|muligvis|formentlig|tyder\s+på|typisk\s+for|ligner|ser\s+ud\s+til|ser\s+ud\s+som|likely|probably`),
    inQuestions: true,
  },
  // Vurdering af tilstand. Kun vurderinger: copula + ord (også med mellemord, fx "er måske normalt"). Ikke løse ord som "ubehag" eller "problem".
  {
    category: "evaluation",
    pattern: rx(String.raw`unormal|usund|skadet|dårlig|bekymrende|recommend|slid|erosion|misfarv|${COPULA}\s+(${L}+\s+){0,2}?(normal|sund|problem|skade|ubehag|bekymr|i\s+orden|fin|fint)${L}*|grund\s+til\s+bekymr`),
  },
  // Egenomsorgsråd (skyl, børst, smertestillende, is, tygning) hører til tandlægen, ikke til AI'en.
  {
    category: "selfcare",
    pattern: rx(String.raw`skyl${L}*\s+(med\s+)?(saltvand|mund|vand)|saltvand|børst${L}*\s+(grundigt|dine|dit|tænder|tanden|tænderne)|tandtråd|fluor|smertestillende|paracetamol|ibuprofen|panodil|ipren|læg\s+(en\s+)?is(?!${L})|is\s+på\s+(kinden|kæben)|undgå\s+at\s+tygge|tygge\s+på\s+(den|siden)`),
  },
  // Roller og manipulation
  { category: "role", pattern: rx(String.raw`jeg\s+er\s+tandlæge|som\s+tandlæge|jeg\s+anbefaler|jeg\s+mener`), inQuestions: true },
];

// Spørgsmål (sætninger der slutter med "?") rammes kun af de regler ovenfor med inQuestions, og af en
// copula-kontrol. Det lader patientspørgsmål som "Har du tandsten?" og "Haster det for dig?" passere.
const QUESTION_RULES: Rule[] = [
  ...RULES.filter((rule) => rule.inQuestions),
  {
    category: "severity",
    pattern: rx(String.raw`${COPULA}\s+(${L}+\s+){0,2}?(akut|alvorlig|alvorligt|farlig|ufarlig)${L}*`),
  },
  {
    category: "evaluation",
    pattern: rx(String.raw`${COPULA}\s+(${L}+\s+){0,2}?(normal|sund|skadet|dårlig|usund|unormal|i\s+orden|fin|fint)${L}*`),
  },
  {
    category: "diagnosis",
    pattern: rx(String.raw`${COPULA}\s+(${L}+\s+){0,2}?(karies|cyste|infektion|betændelse|paradentose|hul|tandsten|plak|plaque)(?!${L})|du\s+har\s+(et|en)\s+(hul|cyste|infektion|betændelse|abces)`),
  },
];

// Beløb i tal uden valuta. Punktum-tal som 3.000 eller 8.000 tæller altid, også med afsluttende punktum.
// Datoer (12.03.2024) tæller ikke. Tal med 5+ cifre tæller. 3-4 cifre tæller med beløbskontekst
// ("ca. 5000", "5000 kr") og i intervaller (3000-5000). Årstal (1900-2099) og 4-cifrede postnumre tæller ikke med.
const AMOUNT_BEFORE = /(ca\.?|cirka|omkring|godt|knap|over|under|mellem|pris\w*|koste\w*|beløb\w*)\s*$/i;
const AMOUNT_AFTER = /^\s*(kr|kroner|dkk|tusind|,-)/i;
const RANGE_AFTER = /^\s*[-–]\s*(\d{3,4})(?!\d)/;

function isYear(digits: string): boolean {
  return digits.length === 4 && Number(digits) >= 1900 && Number(digits) <= 2099;
}

export function containsAmount(text: string): boolean {
  const dotted = /(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d)/g;
  if (/(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d)/.test(text)) return true;
  // Tal uden punktum (punktum-tal er håndteret ovenfor).
  const plain = text.replace(dotted, "X");
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

// Ord (4+ bogstaver) der må gentages fra patientens egen tekst eller kategori. Bruges kun for chat og patientord i opsummering.
export function wordsOf(text: string, minLength = 4): string[] {
  const matches = text.toLowerCase().match(/[a-zæøå]+/g) ?? [];
  return [...new Set(matches.filter((w) => w.length >= minLength))];
}

// Vurderingsord og emnestammer, som modellen aldrig må gentage fra patienten, også når de står alene.
// Kategoriord (blegning, facing, retainer) og almindelige ord er ikke med, så de kan gentages.
const NOT_ECHOABLE = /^(normal|unormal|sund|usund|skad|problem|ubehag|bekymr|dårlig|slid|erosion|misfarv|alvor|akut|haster|hast|farlig|tandsten|plak|udgift|omkostning|tusind|saltvand|smertestill|karies|koste|pris|billig|dyr)/;

// Et patientord må gentages af modellen kun, hvis det ikke rammer nogen kategori og ikke er et vurderingsord.
// Ellers kan modellen svare "Det er normalt" på "er det normalt?".
export function isEchoableWord(word: string): boolean {
  return findForbiddenCategories(word).length === 0 && !NOT_ECHOABLE.test(word);
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
  for (const sentence of cleaned.split(/(?<=[.!?])\s+/)) {
    const isQuestion = /\?\s*$/.test(sentence.trim());
    const rules = isQuestion ? QUESTION_RULES : RULES;
    for (const rule of rules) {
      if (!hits.includes(rule.category) && rule.pattern.test(sentence)) hits.push(rule.category);
    }
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
