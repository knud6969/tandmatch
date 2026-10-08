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

const layerRules = [
  layer(
    ["app/**/*.{ts,tsx}"],
    ["@/models/*", "@/controllers/*", "@/services/*"],
    "Sider og layouts i app/ re-eksporterer fra views/ og bruger kun middleware/ til områdevagter.",
    ["app/api/**"],
  ),
  layer(
    ["app/api/**/*.ts"],
    ["@/models/*", "!@/models/db", "@/models/db/*", "!@/models/db/supabase", "@/services/*", "@/views/*"],
    "Routes kalder én controller. Kun createSupabaseServerClient må hentes fra models/.",
  ),
  layer(
    ["middleware/**/*.ts"],
    ["@/controllers/*", "@/services/*", "@/views/*", "@/app/*"],
    "middleware/ må kun bruge models/ og lib/.",
  ),
  layer(
    ["controllers/**/*.ts"],
    ["@/controllers/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http"],
    "Controllers må kun bruge models/, services/, lib/ og middleware/http. Delt logik hører til i services/.",
  ),
  layer(
    ["services/**/*.ts"],
    ["@/controllers/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http"],
    "services/ må kun bruge models/, lib/ og ApiError.",
  ),
  layer(
    ["models/**/*.ts"],
    ["@/controllers/*", "@/services/*", "@/views/*", "@/app/*", "@/middleware/*", "!@/middleware/http"],
    "models/ må kun bruge models/db, lib/ og ApiError.",
  ),
  layer(
    ["views/**/*.{ts,tsx}"],
    ["@/models/*", "@/controllers/*", "@/services/*", "@/middleware/*", "@/app/*"],
    "Views henter data via /api med views/utils/api-client og importerer kun views/ og lib/.",
  ),
  layer(
    ["lib/**/*.ts"],
    ["@/models/*", "@/controllers/*", "@/services/*", "@/middleware/*", "@/views/*", "@/app/*"],
    "lib/ er delt kode uden afhængigheder til andre lag.",
  ),
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
  ]),
]);

export default eslintConfig;
