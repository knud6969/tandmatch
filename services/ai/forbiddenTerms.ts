// Filter for forbudt indhold (architecture 7.5, række 5), registrering af emner patienten spørger om (7.3)
// og detektion af akutte tegn (7.3). Filteret logger aldrig tekst: det returnerer kun kategorinavne.
// Dansk og engelsk. Ren fil uden server-imports, så den kan testes direkte.
//
// JS' \b og \w kender ikke æ, ø og å, så ordgrænser er lookarounds med \p{L}.

import { OUT_OF_SCOPE_TOPICS } from "@/lib/constants/ai";
import type { OutOfScopeTopic } from "@/lib/types/ai";
import { AI_RULES } from "./rules";

export type ForbiddenCategory =
  | "price" // beløb, valuta, prisord. Gælder altid
  | "clinic_recommendation" // anbefaling, rangering eller omtale af bestemte klinikker. Gælder altid
  | "definitive" // endelige diagnoser, garantier, "du behøver ikke tandlæge". Gælder altid
  | "mdr_strict" // diagnose- og alvorlighedsord. Kun når rules.strictMdrMode er true
  | "assessment" // foreløbig vurdering i en tekst, hvor den ikke hører hjemme (reply og opsummeringen)
  | "speculation" // gætteri uden diagnoseord ("sandsynligvis", "ligner en …"). Kun i opsummeringen
  | "image_interpretation"; // fortolkning i billedfelter

const L = String.raw`\p{L}`;
const rx = (source: string) => new RegExp(source, "iu");
const word = (alternatives: string) => String.raw`(?<!${L})(?:${alternatives})(?!${L})`;

// ---------- Priser ----------
// OBS: "krone" er en behandling i kataloget (tandkrone) og er derfor ikke et prisord. Valuta kræver et tal,
// bortset fra "kr" og "kroner" alene (kroner efterfulgt af "på tænderne" er behandlingen).
const NUMBER_WORD = String.raw`(?:en|et|to|tre|fire|fem|seks|syv|otte|ni|ti|elleve|tolv|tyve|tredive|fyrre|halvtreds|nogle|par|flere|mange|adskillige|\d+)`;
const PRICE_PATTERNS: RegExp[] = [
  rx(String.raw`\d[\d.,\s]*\s*(kr\.?|kroner|dkk|euro|eur|,-)(?!${L})`),
  rx(word(String.raw`kr\.?|dkk|euro|usd`)),
  rx(String.raw`(?<!${L})kroner(?!${L})(?!\s+(?:på|til|over)\s+(?:tand|tænder|fortand|kindtand|dine\s+tænder|mine\s+tænder))`),
  rx(String.raw`[€$£]`),
  rx(String.raw`${L}*pris(?:en|er|erne|et)?(?:overslag|interval|niveau|forskel|liste|tilbud|spænd)?(?!${L})`),
  rx(String.raw`(?<!${L})pris(?!me)${L}*`), // prismæssigt, prisværdig …
  rx(word(String.raw`koste|koster|kostede|kostet|kostende|kostpris|udgift|udgifter|omkostning|omkostninger|billig|billigt|billigere|billigst|dyr|dyrt|dyre|dyrere|dyrest|gratis|rabat|rabatter|betalingsplan|betalingsmuligheder|egenbetaling|tilskud|takst|taksten|honorar|honorarer|regning|regningen|betale|betaler|betaling|betalingen|økonomi|økonomisk|økonomiske|beløb|beløbet|beløbene|beløbs`)),
  rx(String.raw`(?<!${L})tusind${L}*`), // fem tusinde, nogle tusinde
  rx(String.raw`(?<!${L})${NUMBER_WORD}\s+hundrede?(?!${L})|(?<!${L})hundrede?\s+kr`),
  rx(String.raw`${L}*cifret${L}*`), // firecifret beløb
  rx(word(String.raw`price|prices|pricing|cost|costs|cheap|cheaper|expensive|fee|fees|dollars?|bucks`)),
];

// Beløb i tal uden valuta. Tal med punktum som 3.000 og tal med mellemrum som 4 500 tæller altid. Tal med 5+ cifre
// tæller. Tal med 3-4 cifre tæller, medmindre det er et årstal uden beløbskontekst, en tid eller en mængde med
// enhed ("60 minutter", "2-3 uger" har kun 1-2 cifre). 112 og 1813 (akut-numre) tæller ikke.
const EMERGENCY_NUMBERS = new Set(["112", "1813"]);
const AMOUNT_BEFORE_STRONG = /(ca\.?|cirka|pris\w*|koste\w*|beløb\w*|ligger\s+(på|omkring)|lyder\s+på|op\s+til|løber\s+(op\s+)?(i|på)|betal\w*)\s*$|(pris\w*|koste\w*|beløb\w*)\s+((er|på|bliver|ender|lyder)\s+)+$/i;
const AMOUNT_AFTER = /^\s*(kr|kroner|dkk|tusind|,-)/i;
const UNIT_AFTER = /^\s*(min\b|minutter|minut|timer|time\b|uger|uge\b|dage|dag\b|år\b|måneder|måned|mdr|gange|gang\b|tegn|ord\b|sekunder|sek\b|mm\b|cm\b|ml\b|mg\b|grader|%|procent|stk)/i;
const RANGE_AFTER = /^\s*[-–]\s*(\d{3,4})(?!\d)/;

function isYear(digits: string): boolean {
  return digits.length === 4 && Number(digits) >= 1900 && Number(digits) <= 2099;
}

export function containsAmount(text: string): boolean {
  if (/(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d)/.test(text)) return true;
  if (/(?<![\d.,])\d{1,3}(?:\s\d{3})+(?!\d)/.test(text)) return true;
  for (const m of text.matchAll(/\d+/g)) {
    const digits = m[0];
    const start = m.index ?? 0;
    const end = start + digits.length;
    if (digits.length >= 5) return true;
    if (digits.length < 3) continue;
    if (EMERGENCY_NUMBERS.has(digits)) continue;
    const before = text.slice(Math.max(0, start - 25), start);
    const after = text.slice(end, end + 25);
    if (AMOUNT_AFTER.test(after)) return true;
    if (UNIT_AFTER.test(after)) continue;
    if (/\d[.,:]$/.test(before)) continue; // del af decimaltal eller klokkeslæt
    if (isYear(digits)) {
      if (AMOUNT_BEFORE_STRONG.test(before)) return true;
      const range = RANGE_AFTER.exec(after);
      if (range && !isYear(range[1])) return true;
      continue;
    }
    return true;
  }
  return false;
}

// ---------- Klinikanbefaling ----------
const CLINIC_NOUN = String.raw`(?:klinik|klinikker|klinikken|tandlæge|tandlæger|tandlægen|tandlægeklinik|tandlægehus|tandlægehuset)`;
const CLINIC_PATTERNS: RegExp[] = [
  rx(String.raw`(?<!${L})(bedste|bedre|dygtigste|dygtigere|førende|mest\s+erfarne|top|bedst\s+anmeldt|højest\s+rangeret)\s+(${L}+\s+)?${CLINIC_NOUN}`),
  rx(String.raw`${CLINIC_NOUN}\s+(${L}+\s+){0,2}(er|var|virker)\s+(${L}+\s+)?(bedst|bedre|bedste|god|godt|dårlig|dygtig|dygtigere|anbefalelsesværdig|at\s+foretrække)(?!${L})`),
  rx(String.raw`(anbefal${L}*|foreslå${L}*|vælg|vælge|kontakt|book|prøv)[^.!?\n]{0,40}(en\s+bestemt|denne|den\s+her|netop)\s+${CLINIC_NOUN}`),
  rx(String.raw`(anbefal${L}*|vælg|vælge)[^.!?,\n]{0,25}(klinik|klinikker|klinikken)(?!${L})`),
  rx(String.raw`(vælg|vælge|kontakt|book)\s+(klinikken|tandlægen)\s+(med|der|som)`),
  rx(String.raw`${CLINIC_NOUN}\s+(med|der\s+har)\s+(de\s+)?(bedste|højeste|flest)`),
  rx(String.raw`(rang(?:ér|er)${L}*)`),
  rx(String.raw`(?<!${L})(trustpilot)[^.!?\n]{0,30}(bedst|højest|flest)`),
  rx(String.raw`(?<!${L})trustpilot`),
  rx(String.raw`(gode|god|flest|bedste|bedst|mange|positive|fine|høje|højeste|dårlige|negative|fem[-\s]stjernede|\d+\s+stjerner)\s+(${L}+\s+)?(anmeldelse${L}*|stjerne${L}*|score${L}*|rating${L}*|bedømmelse${L}*|omtale${L}*)`),
  rx(String.raw`(?<!${L})klinik${L}*[^.!?\n]{0,60}(?<!${L})anmeldelse${L}*|(?<!${L})anmeldelse${L}*[^.!?\n]{0,60}(?<!${L})klinik${L}*`),
  rx(String.raw`(?<!${L})(en|den)\s+(klinik|tandlæge)(en)?,?\s+(der|som)\s+(har|får|scorer)\s+(${L}+\s+)?(flest|højest|bedst|mest|lavest)`),
  rx(String.raw`(?<!${L})(gå|går)\s+efter\s+(den|en)\s+(${L}+\s+)?${CLINIC_NOUN}`),
];
// Klinikker med egennavn eller stednavn ("Tandlægehuset Vesterbro", "Vesterbro Tandlæger", "Klinikken på Nørrebro").
// Kræver stort bogstav i stednavnet, så de kontrolleres på den originale tekst (ikke case-insensitivt).
const CLINIC_NAME_PATTERNS: RegExp[] = [
  /(?<!\p{L})(Tandlægerne|Tandlægehuset|Tandlægeklinikken|Tandklinikken|Tandklinik|Dental|Tandlæge)\s+\p{Lu}\p{Ll}+/u,
  /(?<!\p{L})\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+)?\s+(Tandlæger|Tandlægerne|Tandlægehus|Tandlægehuset|Tandlægeklinik|Tandklinik|Klinik|Klinikken|Dental|Tandpleje|Tandlægecenter|Tandlægecentret)(?!\p{L})/u,
  /(?<!\p{L})[Kk]linikken\s+(på|i|ved|hos)\s+\p{Lu}/u,
];

// ---------- Endelige udsagn ----------
// Diagnoseord (dansk og engelsk). Bruges i "det er …", "du har …" og i vurderingsmønstrene.
const DIAGNOSIS = String.raw`(?:karies|caries|cavity|cavities|paradentos${L}*|parodont${L}*|periodont${L}*|gingivit${L}*|pulpit${L}*|abces${L}*|abscess${L}*|byld${L}*|infektion${L}*|infection|inflammation${L}*|betændelse${L}*|cyste${L}*|hul(?:ler|let)?|rodbehandling${L}*|root\s+canal|tandsten|knirsk${L}*|bidfejl|tandpine|nerveskade${L}*|tandkødssygdom${L}*|tandløsning|tandkødsbetændelse)`;
const DX = String.raw`(?<!${L})${DIAGNOSIS}(?!${L})`;
const MEDICINE = String.raw`(?:ipren|ibuprofen|panodil|pamol|paracetamol|treo|disprin|kodein|tramadol|antibiotika|penicillin|smertestillende|håndkøbsmedicin|medicin|pille|piller|tablet|tabletter|nellikeolie|saltvand|isterninger|is)`;
const TREATMENT_ADVICE = String.raw`(?:rodbehandling${L}*|udtrækning${L}*|trække\s+tanden|fyldning${L}*|krone|bro|implantat${L}*|antibiotika|operation${L}*|røntgen)`;

const DEFINITIVE_PATTERNS: RegExp[] = [
  rx(String.raw`helt\s+sikkert|uden\s+tvivl|ingen\s+tvivl|næsten\s+sikkert|næppe\s+andet|kan\s+ikke\s+være\s+andet|(?<!${L})100\s*%|garanti|garanter${L}*|guarantee`),
  rx(String.raw`du\s+har\s+(helt\s+|klart\s+|bestemt\s+|med\s+sikkerhed\s+)*(en\s+|et\s+)?${DX}|du\s+har\s+(helt\s+)?(klart\s+|bestemt\s+|med\s+sikkerhed\s+)?tandsten`),
  rx(String.raw`(?<!${L})(det|dette|den|der)\s+(er|var|lyder\s+som|ser\s+ud\s+som)\s+((helt|klart|bare|nok|sikkert|næsten\s+sikkert|desværre|ret|meget|ikke)\s+)*(en\s+|et\s+)?(${L}+\s+)?${DX}`),
  rx(String.raw`(behøver|skal)\s+(du\s+)?ikke\s+(at\s+)?(gå\s+til\s+|se\s+|kontakte\s+|opsøge\s+)?(en\s+)?tandlæge`),
  rx(String.raw`ingen\s+grund\s+til\s+(at\s+)?(kontakte|gå\s+til|se|opsøge)\s+(en\s+)?tandlæge`),
  rx(String.raw`ikke\s+noget\s+(at\s+(bekymre|være\s+bekymret|gøre\s+ved)|alvorligt|farligt)|ingen\s+grund\s+til\s+(bekymring|at\s+bekymre|at\s+være\s+bekymret)|ikke\s+(alvorlig|farlig)${L}*`),
  rx(String.raw`(?<!${L})(jeg\s+er\s+tandlæge|som\s+tandlæge)`),
  rx(String.raw`(det\s+kan\s+(sagtens\s+)?vente|er\s+ufarligt|er\s+ufarlig|intet\s+at\s+bekymre)`),
  rx(String.raw`kan\s+(godt\s+|sagtens\s+|roligt\s+)+vente|roligt\s+vente|vent\s+og\s+se|vente\s+og\s+se|kan\s+vente\s+med\s+(at\s+)?(gå|kontakte|se|opsøge|booke|bestille)`),
  // Medicinråd og selvbehandling
  rx(word(String.raw`ipren|ibuprofen|panodil|pamol|paracetamol|disprin|kodein|tramadol|håndkøbsmedicin`)),
  rx(String.raw`(?<!${L})(tag|tage|prøv|køb|spis|brug|skyl)\s+(munden\s+)?(en\s+|et\s+|to\s+|nogle\s+|lidt\s+|noget\s+|med\s+)?(${L}+\s+)?${MEDICINE}(?!${L})`),
  // Behandlingsanvisning som endeligt udsagn
  rx(String.raw`du\s+(skal|må|bør|trænger\s+til|har\s+brug\s+for)\s+(nok\s+|helt\s+sikkert\s+|bestemt\s+|absolut\s+)?(have\s+)?(en\s+|et\s+)?${TREATMENT_ADVICE}(?!${L})`),
];

// ---------- Strenge MDR-ord (kun når rules.strictMdrMode) ----------
// MDR-TILPASNING: listen aktiveres af strictMdrMode i rules.ts. Den er diagnose- og alvorlighedsordene fra den tidligere model.
export const mdrStrictTerms: RegExp[] = [
  rx(String.raw`karies|caries|paradentos|parodont|periodont|gingivit|pulpit|abces|infektion|inflammation|betænd|sygdom|diagnos|(?:(?<!${L})|(?<=tand|rod))revn|fraktur|overbid|underbid|malokklusion|bidfejl|nerveskade|rodspids|cyste|tandsten|plaque`),
  rx(word(String.raw`hul|huller|hullet|hulrum|byld|bylder`)),
  rx(String.raw`alvorlig|severe|severity|urgent|kritisk|slemt|farlig|ufarlig|usund|unormal|skadet|bekymrende|erosion|misfarv`),
  rx(String.raw`pege?r?\s+på|tyder\s+på|kan\s+skyldes|kan\s+være\s+tegn|sandsynlig|formentlig|muligvis|kunne\s+være|kan\s+være\s+(en|et)\s`),
];

// ---------- Vurdering i en tekst, hvor den ikke hører hjemme (reply og opsummeringen) ----------
// Foreløbige vurderinger hører kun hjemme i preliminaryAssessment, som UI viser med mærkat (architecture 7.3).
const ASSESSMENT_PATTERNS: RegExp[] = [
  rx(String.raw`foreløbig\s+vurdering|kan\s+pege\s+på|kunne\s+pege\s+på|peger\s+på|tyder\s+på|kan\s+skyldes|kunne\s+skyldes|skyldes\s+(sandsynligvis|formentlig|nok)|kan\s+være\s+tegn\s+på|kunne\s+være\s+tegn\s+på|ligner\s+tegn`),
  rx(String.raw`(kan|kunne|måske|muligvis|nok|sandsynligvis|formentlig)\s+(godt\s+)?(være|ligne)\s+(${L}+\s+){0,2}${DX}`),
  rx(String.raw`(lyder\s+som|ser\s+ud\s+som|ser\s+ud\s+til\s+at\s+være|minder\s+om|ligner)\s+(${L}+\s+){0,3}${DX}`),
  rx(String.raw`(sandsynligvis|formentlig|nok|muligvis)\s+(${L}+\s+){0,3}${DX}|${DX}\s+(${L}+\s+){0,2}(sandsynligvis|formentlig|muligvis)`),
];

// Gætteri uden diagnoseord. Kun i opsummeringen, hvor al fortolkning er forbudt.
const SPECULATION_PATTERNS: RegExp[] = [rx(String.raw`ligner\s+(en|et)|sandsynligvis|formentlig`)];

// ---------- Fortolkning i billedfelter ----------
const IMAGE_INTERPRETATION_PATTERNS: RegExp[] = [
  rx(String.raw`karies|caries|hul\b|huller|infektion|betænd|abces|revn|knæk|skade|ødelagt|rådden|dårlig|sund|usund|slid|slidt|erosion|misfarv|plak|tandsten|paradentos|alvorlig|bekymr|problem|ser\s+ud\s+til|tyder|ligner|muligvis|sandsynlig|formentlig|normal|unormal|skæv`),
];

const PATTERNS: Record<Exclude<ForbiddenCategory, "mdr_strict">, RegExp[]> = {
  price: PRICE_PATTERNS,
  clinic_recommendation: CLINIC_PATTERNS,
  definitive: DEFINITIVE_PATTERNS,
  assessment: ASSESSMENT_PATTERNS,
  speculation: SPECULATION_PATTERNS,
  image_interpretation: IMAGE_INTERPRETATION_PATTERNS,
};

export type FilterOptions = {
  // Kategorier der kontrolleres. Standard: price, clinic_recommendation, definitive.
  categories?: readonly ForbiddenCategory[];
  strictMdrMode?: boolean;
};

export const DEFAULT_CATEGORIES: readonly ForbiddenCategory[] = ["price", "clinic_recommendation", "definitive"];
// Svar til patienten: også vurderinger, som kun må stå i preliminaryAssessment.
export const REPLY_CATEGORIES: readonly ForbiddenCategory[] = [...DEFAULT_CATEGORIES, "assessment"];

// Returnerer kategorierne for forbudt indhold (tom liste = tilladt).
// Patientens egne ord åbner aldrig for forbudte ord her (K3): den eneste undtagelse, patientens eget budget i
// patientWishes, håndteres i guard.ts ved at udelade kategorien "price" for netop de udsagn.
export function findForbiddenCategories(text: string, options: FilterOptions = {}): ForbiddenCategory[] {
  const categories = new Set<ForbiddenCategory>(options.categories ?? DEFAULT_CATEGORIES);
  if (options.strictMdrMode) categories.add("mdr_strict");

  const cleaned = text.toLowerCase();
  const hits: ForbiddenCategory[] = [];
  for (const category of categories) {
    const patterns = category === "mdr_strict" ? mdrStrictTerms : PATTERNS[category];
    let hit = patterns.some((p) => p.test(cleaned));
    if (category === "price" && !hit) hit = containsAmount(cleaned);
    if (category === "clinic_recommendation" && !hit) hit = CLINIC_NAME_PATTERNS.some((p) => p.test(text));
    if (hit) hits.push(category);
  }
  return hits;
}

// ---------- Foreløbig vurdering: formulering ----------
// En vurdering skal være foreløbig (forbehold) og pege på klinikkens endelige vurdering. Hver sætning med et
// diagnoseord skal selv have et forbehold, så et forbehold i en anden sætning ikke gør "Det er paradentose" foreløbigt.
const HEDGE = rx(word(String.raw`kan|kunne|måske|muligt|muligvis|eventuelt|foreløbig|foreløbigt|peger|tyder|ligner|sandsynligvis`));
const DEFERS_TO_CLINIC = rx(word(String.raw`klinikken|klinikkens|tandlægen|tandlægens`));
const NEGATED_HEDGE = rx(String.raw`kan\s+ikke|kunne\s+ikke`);
const DX_RX = rx(DX);

export function isPhrasedAsPreliminary(assessment: string): boolean {
  if (!(HEDGE.test(assessment) && DEFERS_TO_CLINIC.test(assessment))) return false;
  if (DEFINITIVE_PATTERNS.some((p) => p.test(assessment))) return false;
  const sentences = assessment.split(/(?<=[.!?])\s+/);
  return sentences.every((sentence) => {
    if (!DX_RX.test(sentence)) return true;
    return HEDGE.test(sentence) && !NEGATED_HEDGE.test(sentence);
  });
}

// ---------- Emner patienten spørger om ----------
const TOPIC_PATTERNS: Record<OutOfScopeTopic, RegExp> = {
  price: rx(
    String.raw`hvad\s+koster|koster\s+(det|den|de)|hvor\s+meget\s+(koster|skal\s+jeg\s+betale)|hvad\s+ville\s+det\s+koste|${L}*pris(?:en|er|erne)?(?!${L})|hvor\s+dyrt|billig|dyr(?!${L})|(?<!${L})kr(?!${L})|kroner|how\s+much|(?<!${L})cost|` +
      String.raw`hvor\s+meget\s+(skal|vil|må|kommer|ender|bliver)\s+(jeg|det|man|den)[^.!?\n]{0,25}(give|betale|af\s+med|bruge|koste|løbe)|` +
      String.raw`hvad\s+(løber|ender|lander|kommer)\s+(det|den|regningen|behandlingen)[^.!?\n]{0,20}(op|på|til)|hvad\s+bliver\s+(regningen|det\s+til)|hvad\s+skal\s+(jeg|man)\s+(give|betale)|(?<!${L})regning|(?<!${L})betal(e|ing)`,
  ),
  clinic_recommendation: rx(
    String.raw`(hvilken|hvilke)\s+(${L}+\s+)?(klinik|tandlæge)|(bedste|bedre|dygtigste|billigste)\s+(${L}+\s+)?(klinik|tandlæge)|anbefal${L}*\s+(du\s+|i\s+)?(en\s+|nogen\s+)?(${L}+\s+)?(klinik|tandlæge)|er\s+(klinik|tandlæge)\w*\s+\p{L}+\s+(god|dygtig)|which\s+(clinic|dentist)|best\s+(clinic|dentist)|` +
      String.raw`hvem\s+(er|ville\s+være|vil\s+være)\s+(den\s+)?(bedst|bedste|dygtigst|dygtigste|billigst|billigste|bedre)|hvem\s+skal\s+jeg\s+(vælge|gå\s+til|booke|kontakte|bruge)|` +
      String.raw`kan\s+du\s+(anbefale|foreslå)\s+(mig\s+)?(nogen|nogle)|anbefal${L}*\s+(du\s+)?(mig\s+)?(nogen|nogle)|` +
      String.raw`hvor\s+(skal|bør|kan|burde)\s+jeg\s+(gå|henvende\s+mig|tage|rette\s+henvendelse)\s+(hen|til)`,
  ),
};

export function detectOutOfScopeTopics(text: string, blocked: readonly OutOfScopeTopic[] = AI_RULES.blockedTopics): OutOfScopeTopic[] {
  return OUT_OF_SCOPE_TOPICS.filter((topic) => blocked.includes(topic) && TOPIC_PATTERNS[topic].test(text));
}

export function mergeTopics(...lists: readonly (readonly OutOfScopeTopic[])[]): OutOfScopeTopic[] {
  const all = new Set(lists.flat());
  return OUT_OF_SCOPE_TOPICS.filter((t) => all.has(t));
}

// ---------- Akutte tegn i patientens tekst ----------
// Sikkerhedsnet oven på modellens eget emergency-flag: gælder uanset AI-regler og MDR (architecture 7.3).
// Bevidst bred: en falsk alarm koster en ekstra henvisning, en overset akut sag koster mere.
const NEGATED_SYMPTOM = rx(
  String.raw`(ingen|uden|ikke|ingen\s+tegn\s+på)\s+(${L}+\s+){0,2}(feber|hævelse|hævet|blødning|smerter|ondt)|(no|without)\s+(${L}+\s+)?(fever|swelling|bleeding|pain)`,
);
const FEVER_TEMPERATURE = String.raw`(?<![\d.,])(?:3[89]|4[0-2])(?:[.,]\d)?\s*(?:grader|°|i\s+temp${L}*|i\s+feber|i\s+temperatur|c(?!${L}))|temp${L}*\s+(?:på\s+|er\s+|over\s+)?(?:3[89]|4[0-2])(?![\d])`;
const FACE_PART = String.raw`(?:kind|kinden|ansigt|ansigtet|læbe|læben|øjet|hals|halsen|kæbe|kæben|tandkød|tandkødet|gummen)`;
const EMERGENCY_PATTERNS: RegExp[] = [
  rx(String.raw`(stærke?|voldsomme?|kraftige?|slemme?|uudholdelige?|ulidelige?|frygtelige?|enorme?|vildt|rigtig\s+mange)\s+(${L}+\s+)?(smerte${L}*|ondt)`),
  // Ordstilling og styrke: "så ondt at jeg ikke kan sove", "meget ondt", "rigtig ondt"
  rx(String.raw`(så|meget|rigtig|virkelig|ekstremt|enormt|utroligt|forfærdeligt|frygteligt|helt\s+vildt|vildt|sindssygt|pissende)\s+(ondt|ømt)(?!${L})`),
  rx(String.raw`ikke\s+til\s+at\s+holde\s+ud|kan\s+ikke\s+holde\s+(det|smerten|ondt)\s+(ud|mere)|uudholdelig${L}*|ulidelig${L}*`),
  rx(String.raw`(kan\s+ikke\s+sove|ikke\s+kunne\s+sove|vågner|vågnede)[^.!?\n]{0,30}(smerte${L}*|ondt)|(smerte${L}*|ondt)[^.!?\n]{0,40}(kan\s+ikke\s+sove|ikke\s+sove|ikke\s+kunne\s+sove|vågner|vågnede)`),
  rx(String.raw`hæve${L}*|hævet`),
  rx(String.raw`feber|høj\s+temperatur|${FEVER_TEMPERATURE}`),
  rx(String.raw`(?<!${L})(pus|byld|bylder|abces${L}*)(?!${L})|${L}*pusholdig${L}*`),
  rx(String.raw`${FACE_PART}\s+(${L}+\s+){0,2}(er|bliver|blev|føles|ser)\s+(${L}+\s+)?(tyk|tykke|opsvulmet|opsvulmede|opsvulmet|skæv|skæve|stor\s+som)|(tyk|tykke|opsvulmet)\s+(kind|læbe|kæbe|hals|ansigt)`),
  rx(String.raw`blød${L}*[^.!?\n]{0,40}(stopper\s+ikke|ikke\s+stoppe|vil\s+ikke\s+stoppe|kraftig|meget|ophører\s+ikke)|(stopper|ophører)\s+ikke[^.!?\n]{0,30}blød`),
  rx(String.raw`bløder\s+og\s+bløder|bløder\s+(hele\s+tiden|konstant|vedvarende|stadig|stadigvæk|igen\s+og\s+igen|i\s+timevis)|bliver\s+ved\s+(med\s+)?at\s+bløde|bløde\s+i\s+timevis`),
  rx(String.raw`traume|ulykke|slået\s+(en\s+|min\s+|mine\s+)?(tand|tænder)|tand\w*\s+(er\s+)?(slået|røget|faldet)\s+ud|(fik|har\s+fået)\s+(et\s+)?(slag|stød)|slag\s+(i|mod|på)\s+(munden|kæben|ansigtet)|faldet\s+(og|på)|knækket\s+(efter|pga|på\s+grund\s+af)`),
  rx(String.raw`(svært|problemer)\s+ved\s+(at\s+)?(trække\s+vejret|synke|sluge)|vejrtræknings${L}*|kan\s+ikke\s+synke`),
  rx(String.raw`(kan\s+ikke|svært\s+at)\s+(åbne|spærre)\s+(munden|op)`),
  // Engelsk
  rx(word(String.raw`swollen|swelling|swell|fever|abscess|pus|unbearable|trauma|emergency`)),
  rx(String.raw`severe\s+pain|terrible\s+pain|a\s+lot\s+of\s+pain|(so|very)\s+much\s+pain|(really|so)\s+painful|bleeding\s+(a\s+lot|heavily|won'?t\s+stop|doesn'?t\s+stop)|knocked\s+out|can'?t\s+(sleep|breathe|swallow|open\s+my\s+mouth)|cannot\s+(sleep|breathe|swallow)`),
];
const LIFE_THREATENING_PATTERNS: RegExp[] = [
  rx(String.raw`(svært|problemer)\s+ved\s+(at\s+)?(trække\s+vejret|synke|sluge)|vejrtræknings${L}*|kan\s+ikke\s+synke|kan\s+ikke\s+trække\s+vejret|can'?t\s+(breathe|swallow)|cannot\s+(breathe|swallow)`),
  rx(String.raw`hæve${L}*[^.!?\n]{0,30}(hals|ansigt|øje|tunge)|(hals|ansigt|tunge)[^.!?\n]{0,30}hæve${L}*`),
];

export type EmergencyDetection = { emergency: boolean; lifeThreatening: boolean };

export function detectEmergency(text: string): EmergencyDetection {
  const cleaned = text.toLowerCase().replace(new RegExp(NEGATED_SYMPTOM.source, "giu"), " ");
  const emergency = EMERGENCY_PATTERNS.some((p) => p.test(cleaned));
  const lifeThreatening = LIFE_THREATENING_PATTERNS.some((p) => p.test(cleaned));
  return { emergency: emergency || lifeThreatening, lifeThreatening };
}

// Ord og tal i en tekst (små bogstaver). Bruges til at se, om en tekst kun består af patientens egne ord.
export function wordsOf(text: string, minLength = 2): string[] {
  const matches = text.toLowerCase().match(/[\p{L}\d]+(?:[.,][\d]+)*/gu) ?? [];
  return [...new Set(matches.filter((w) => w.length >= minLength))];
}
