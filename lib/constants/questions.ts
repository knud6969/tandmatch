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
