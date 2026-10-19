import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Lagregler (docs/architecture.md 2.1). Type-imports er tilladt på tværs af lag; de forsvinder ved kompilering.
function layer(files, groups, message, ignores = []) {
  return {
    files,
    ignores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: groups, message, allowTypeImports: true },
            // Relative imports op ad mappetræet ville omgå lagreglerne. Brug "@/..." i stedet.
            { regex: "^\\.\\./", message: "Brug \"@/...\" i stedet for \"../\" (lagreglerne gælder kun for @-stier)." },
          ],
        },
      ],
    },
  };
}

// Ren kode i services/ uden I/O (architecture 2.1): testes direkte og starter ikke med import "server-only".
const PURE_SERVICE_FILES = [
  "services/ai/{rules,errors,forbiddenTerms,guard,pii,promptFormat,schemas,catalogContext}.ts",
  "services/ai/prompts/**/*.ts",
  "services/rankingService.ts",
  "services/availabilityService.ts",
];

const layerRules = [
  layer(
    ["app/**/*.{ts,tsx}"],
    ["@/models/*", "@/controllers/*", "@/services/*"],
    "Sider og layouts i app/ re-eksporterer fra views/ og bruger kun middleware/ til områdevagter.",
    ["app/api/**"],
  ),
  layer(
    ["app/api/**/*.ts"],
    ["@/models/*", "!@/models/db", "@/models/db/*", "!@/models/db/supabase", "@/services/*", "@/views/*", "@supabase/*"],
    "Routes kalder én controller. Kun createSupabaseServerClient må hentes fra models/.",
  ),
  layer(
    ["middleware/**/*.ts"],
    ["@/controllers/*", "@/services/*", "@/views/*", "@/app/*", "@supabase/*"],
    "middleware/ må kun bruge models/ og lib/. Supabase kaldes kun i models/.",
  ),
  layer(
    ["controllers/**/*.ts"],
    ["@/controllers/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http", "@supabase/*"],
    "Controllers må kun bruge models/, services/, lib/ og middleware/http. Delt logik hører til i services/. Supabase kaldes kun i models/ (typen SupabaseClient er tilladt).",
  ),
  layer(
    ["services/**/*.ts"],
    ["@/controllers/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http", "@supabase/*"],
    "services/ må kun bruge models/, lib/ og ApiError. Supabase kaldes kun i models/ (typen SupabaseClient er tilladt).",
    PURE_SERVICE_FILES,
  ),
  // Ren kode i services/ (architecture 2.1): ingen I/O, så ingen models, ingen Supabase og ingen netværksklienter.
  layer(
    PURE_SERVICE_FILES,
    ["@/models/*", "@/controllers/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http", "@supabase/*", "openai", "sharp"],
    "Ren kode i services/ (rules, guard, pii, rankingService, availabilityService m.fl.) må ikke importere models/, Supabase eller netværksklienter.",
  ),
  layer(
    ["models/**/*.ts"],
    ["@/controllers/*", "@/services/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http"],
    "models/ må kun bruge models/base, models/db, lib/ og ApiError.",
    ["models/base/**"],
  ),
  // Basisklasserne kender ikke de konkrete repositories (arv går kun nedad, architecture 2.1.1).
  layer(
    ["models/base/**/*.ts"],
    ["@/models/*", "!@/models/db", "!@/models/db/*", "@/controllers/*", "@/services/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http"],
    "models/base/ må kun bruge models/db, lib/ og ApiError og kender ikke de konkrete repositories.",
  ),
  layer(
    ["views/**/*.{ts,tsx}"],
    ["@/models/*", "@/controllers/*", "@/services/*", "@/middleware/*", "@/app/*"],
    "Views henter data via /api med views/utils/api-client og importerer kun views/ og lib/.",
  ),
  // lib/ deles med appen i mobile/ og må kun importere @/lib/... og zod (architecture 2.1, 13.2).
  {
    files: ["lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(?!@/lib/|zod$)",
              message: "lib/ deles med appen i mobile/ og må kun importere @/lib/... og zod.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Patient-appen (Expo) har sin egen konfiguration (architecture 13.2).
    "mobile/**",
  ]),
]);

export default eslintConfig;
