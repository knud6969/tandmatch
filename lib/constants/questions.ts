// Version og server-side definition af de faste spørgsmål. De endelige spørgsmål er IKKE besluttet
// (architecture 7.1, 12.3). Listen spejler PLACEHOLDER_QUESTIONS i frontend og er den eneste kilde
// til validering af requests.answers. Ukendte nøgler og ukendte svarværdier afvises.
export const QUESTIONS_VERSION = "v0-prototype";

export const QUESTION_DEFINITIONS = {
  aendring: { multiple: true, options: ["placering", "farve", "form", "andet"] },
  overvejet: { multiple: false, options: ["under_1_md", "1_6_md", "over_6_md"] },
  tidligere: { multiple: false, options: ["ja", "nej", "ved_ikke"] },
  start: { multiple: false, options: ["hurtigst", "3_mdr", "undersoeger"] },
} as const satisfies Record<string, { multiple: boolean; options: readonly string[] }>;

export type QuestionKey = keyof typeof QUESTION_DEFINITIONS;

// Visningstekster til tandlægen (labels, ikke rå nøgler). Spejler frontend-teksterne.
export const QUESTION_LABELS: Record<
  QuestionKey,
  { label: string; options: Record<string, string> }
> = {
  aendring: {
    label: "Hvad vil du gerne have ændret?",
    options: { placering: "Placering eller mellemrum", farve: "Farve", form: "Form eller længde", andet: "Andet" },
  },
  overvejet: {
    label: "Hvor længe har du overvejet det?",
    options: { under_1_md: "Under 1 måned", "1_6_md": "1-6 måneder", over_6_md: "Over 6 måneder" },
  },
  tidligere: {
    label: "Har du tidligere fået behandling i området?",
    options: { ja: "Ja", nej: "Nej", ved_ikke: "Ved ikke" },
  },
  start: {
    label: "Hvornår ønsker du at komme i gang?",
    options: { hurtigst: "Hurtigst muligt", "3_mdr": "Inden for 3 måneder", undersoeger: "Jeg undersøger bare" },
  },
};
