import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Grænser mellem domæner og lag (docs/oprydning-features.md, trin 4). Type-imports er tilladt overalt; de forsvinder ved kompilering.
// ESLint bruger kun én no-restricted-imports pr. fil, så filgrupperne nedenfor overlapper ikke. Mønstrene er regulære udtryk,
// fordi gitignore-mønstre ikke kan undtage en undermappe (fx ui.ts) fra en udelukket mappe.
function layer(files, regexes, message, ignores = []) {
  return {
    files,
    ignores,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...regexes.map((regex) => ({ regex, message, allowTypeImports: true })),
            // Relative imports op ad mappetræet ville omgå reglerne. Brug "@/..." i stedet.
            { regex: "^\\.\\./", message: "Brug \"@/...\" i stedet for \"../\" (reglerne gælder kun for @-stier)." },
          ],
        },
      ],
    },
  };
}

const DOMAINS = ["identity", "cases", "clinics", "leads", "booking", "site"];

// Ren kode uden I/O (testes direkte og starter ikke med import "server-only").
const PURE_FILES = [
  "features/cases/ai/{rules,errors,forbiddenTerms,guard,pii,promptFormat,schemas,catalogContext}.ts",
  "features/cases/ai/prompts/**/*.ts",
  "features/clinics/rankingService.ts",
  "features/clinics/availabilityService.ts",
];
const UI_FILES = (d) => [`features/${d}/{components,pages,utils}/**/*.{ts,tsx}`, `features/${d}/ui.ts`];
const TESTS = ["features/*/__tests__/**", "platform/__tests__/**"];

// Andre domæners interne filer (alt andet end deres index.ts og ui.ts).
const otherDomainInternals = (d) => `^@/features/(?!${d}(?:/|$))[a-z]+/(?!ui$).+$`;
// Andre domæners index.ts (serverkode) eller interne filer; kun ui.ts er tilladt.
const otherDomainsExceptUi = (d) => `^@/features/(?!${d}(?:/|$))[a-z]+(?:/(?!ui$).*)?$`;
const ownServerCode = (d) => `^@/features/${d}/(?:ai/.*|[^/]*(?:Repository|Storage|Controller|Service))$`;
const SERVER_ONLY = "^(?:@/platform/(?:db|base|middleware)/|@/platform/[^/]*(?:Repository|cronController)$|@supabase/)";
const ANY_FEATURE_EXCEPT_UI = "^@/features/[a-z]+(?:/(?!ui$).*)?$";

const domainRules = DOMAINS.flatMap((d) => [
  // Serverkode i domænet: controllers, repositories, services og ai/.
  layer(
    [`features/${d}/**/*.ts`],
    [otherDomainInternals(d), "^@/features/[a-z]+/ui$", "^@/components/", "^@/app/"],
    `Serverkode i features/${d} må bruge platform/, lib/ og andre domæners index.ts, aldrig deres interne filer eller UI.`,
    [...UI_FILES(d), ...TESTS, ...PURE_FILES],
  ),
  // UI i domænet: kun klientsikre ting. Data hentes via /api med platform/ui-utils/api-client.
  layer(
    UI_FILES(d),
    [otherDomainsExceptUi(d), ownServerCode(d), SERVER_ONLY],
    `UI i features/${d} må bruge components/ui, platform/ui-utils, lib/ og andre domæners ui.ts, aldrig repositories, controllers eller serverkode.`,
    TESTS,
  ),
]);

const layerRules = [
  ...domainRules,
  // Ren kode (architecture 2.1): ingen I/O, så ingen repositories, Supabase eller netværksklienter.
  layer(
    PURE_FILES,
    ["^@/features/[a-z]+/[^/]*(?:Repository|Storage|Controller)$", SERVER_ONLY, "^openai$", "^sharp$"],
    "Ren kode (ai-reglerne, rankingService, availabilityService) må ikke importere repositories, Supabase eller netværksklienter.",
  ),
  // Sider og layouts i app/ videresender til features/<domæne>/pages og bruger kun platform/middleware til områdevagter.
  layer(
    ["app/**/*.{ts,tsx}"],
    ["^@/features/[a-z]+/[^/]*(?:Repository|Storage|Controller|Service)$"],
    "Sider og layouts i app/ videresender til features/<domæne>/pages.",
    ["app/api/**"],
  ),
  // Routes kalder én controller. Kun klientfabrikken må hentes fra platform/db.
  layer(
    ["app/api/**/*.ts"],
    ["^@/features/[a-z]+/(?:[^/]*(?:Repository|Storage|Service)|components/.*|pages/.*)$", "^@/platform/db/(?!supabase$)", "^@supabase/"],
    "Routes kalder én controller og bruger platform/middleware. Supabase kaldes kun i repositories.",
  ),
  // platform/ er tværgående og kender ingen domæner (undtagen cron og session-/vilkårsvagten, se nedenfor).
  layer(
    ["platform/**/*.{ts,tsx}"],
    ["^@/features/", "^@/app/", "^@/components/"],
    "platform/ er tværgående og må ikke importere domæner, app/ eller UI-komponenter.",
    [...TESTS, "platform/cronController.ts", "platform/middleware/{session,termsGate}.ts", "platform/ui-utils/**"],
  ),
  layer(
    ["platform/ui-utils/**/*.{ts,tsx}"],
    ["^@/features/", "^@/app/", SERVER_ONLY],
    "platform/ui-utils er klientsikre hjælpere og må ikke importere domæner eller serverkode.",
  ),
  // Cron og session-/vilkårsvagten bruger domænerne (identity, booking) via deres index.ts.
  layer(
    ["platform/cronController.ts", "platform/middleware/{session,termsGate}.ts"],
    ["^@/features/[a-z]+/.+$", "^@/app/", "^@/components/"],
    "Cron og session-/vilkårsvagten bruger kun domænernes index.ts.",
  ),
  // Delte UI-komponenter: kun lib/, platform/ui-utils og domænernes ui.ts.
  layer(
    ["components/**/*.{ts,tsx}"],
    [ANY_FEATURE_EXCEPT_UI, SERVER_ONLY, "^@/app/"],
    "components/ui må kun bruge lib/, platform/ui-utils og domænernes ui.ts.",
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
