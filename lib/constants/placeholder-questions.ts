import { QUESTION_DEFINITIONS, type QuestionKey } from "@/lib/constants/questions";

// Visningstekster til de faste spørgsmål. Nøgler, flervalg og gyldige værdier kommer fra lib/constants/questions.ts,
// som er den eneste kilde. Her ligger kun dansk tekst. Spørgsmålene er stadig pladsholdere (architecture 7.1, 12.3).
export type PlaceholderQuestion = {
  key: string;
  label: string;
  multiple: boolean;
  options: { value: string; label: string }[];
};

type QuestionText<K extends QuestionKey> = {
  label: string;
  // Tvinger en tekst for hver værdi i questions.ts. Mangler en, giver TypeScript en fejl.
  options: Record<(typeof QUESTION_DEFINITIONS)[K]["options"][number], string>;
};

const QUESTION_TEXT: { [K in QuestionKey]: QuestionText<K> } = {
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

export const PLACEHOLDER_QUESTIONS: PlaceholderQuestion[] = (Object.keys(QUESTION_DEFINITIONS) as QuestionKey[]).map(
  (key) => {
    const definition = QUESTION_DEFINITIONS[key];
    const text = QUESTION_TEXT[key];
    return {
      key,
      label: text.label,
      multiple: definition.multiple,
      // Typen i QuestionText sikrer, at alle værdier har tekst; opslaget er bredt, fordi key-union ikke kan indekseres pr. nøgle.
      options: definition.options.map((value) => ({ value, label: (text.options as Record<string, string>)[value] })),
    };
  },
);
