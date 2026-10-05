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

const RULES: Rule[] = [
  // Beløb og valuta
  { category: "price", pattern: /\d[\d.,\s]*\s*(kr\.?|kroner|dkk|,-)/i },
  { category: "price", pattern: /(koster|kostpris|prisoverslag|prisestimat|prisniveau|prisinterval|billigst|dyrest|billigere|dyrere|\bkroner\b|\bkrone\b|\bdkk\b|\beuro\b|[€$£])/i },
  // Diagnose- og tilstandsord
  {
    category: "diagnosis",
    pattern: /\b(karies|caries|paradentos|parodont|periodont|gingivit|pulpit|abces|infektion|inflammation|betænd|tandsygdom|sygdom|diagnos|revne|knækk|fraktur|overbid|underbid|malokklusion|bidfejl|nerveskade|rodspids)/i,
  },
  // Alvorlighed og hast
  { category: "severity", pattern: /\b(alvorlig|alvorligt|alvorlighed|severe|severity|mild|mildt|akut|akutte|hastende|urgent|bekymrende|kritisk)/i },
  // Behandlingsforslag og egnethed
  {
    category: "treatment",
    pattern: /\b(anbefal|facing|blegning|blegn|bleach|implantat|tandkrone|krone|veneer|invisalign|retainer|rodbehandling|udtrækning|udtræk|fyldning|løses med|kan løses|egnet|egnethed|du bør|du skal have|du har brug for|treatment|treat)/i,
  },
  // Sandsynlighed og fortolkning
  {
    category: "probability",
    pattern: /\b(sandsynlig|muligvis|formentlig|tyder på|typisk for|ligner|ser ud til|ser ud som|likely|probably)/i,
  },
  // Vurdering af tilstand (normalitet, sundhed, problem)
  {
    category: "evaluation",
    pattern: /\b(normal|unormal|sund|sundt|usund|skadet|skade|problem|dårlig|ubehag|bekymr|recommend)/i,
  },
  // Roller og manipulation
  { category: "role", pattern: /\b(jeg er tandlæge|som tandlæge|jeg anbefaler|jeg mener)/i },
];

// Ord (4+ bogstaver) der må gentages fra patientens egen tekst eller kategori. Bruges kun for chat og patientord i opsummering.
export function wordsOf(text: string, minLength = 4): string[] {
  const matches = text.toLowerCase().match(/[a-zæøå]+/g) ?? [];
  return [...new Set(matches.filter((w) => w.length >= minLength))];
}

// Returnerer kategorier for forbudt indhold. allowTerms fjernes først (fx ord patienten selv skrev).
export function findForbiddenCategories(text: string, allowTerms: string[] = []): ForbiddenCategory[] {
  let cleaned = text.toLowerCase();
  for (const term of allowTerms) {
    if (term.length >= 4) cleaned = cleaned.split(term.toLowerCase()).join(" ");
  }
  const hits: ForbiddenCategory[] = [];
  for (const rule of RULES) {
    if (rule.pattern.test(cleaned) && !hits.includes(rule.category)) hits.push(rule.category);
  }
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
