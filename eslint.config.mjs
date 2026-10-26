import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Grænser mellem domæner og lag (docs/oprydning-features.md, trin 4). Type-imports er tilladt overalt; de forsvinder ved kompilering.
// ESLint bruger kun den sidste no-restricted-imports, der matcher en fil, så hver gruppe indeholder alle regler for sine filer. Mønstrene er regulære udtryk,
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

// Ren kode uden I/O pr. domæne (testes direkte og starter ikke med import "server-only").
const PURE = {
  cases: ["features/cases/ai/{rules,errors,forbiddenTerms,guard,pii,promptFormat,schemas,catalogContext}.ts", "features/cases/ai/prompts/**/*.ts"],
  clinics: ["features/clinics/rankingService.ts", "features/clinics/availabilityService.ts"],
};

const UI_FILES = (d) => [`features/${d}/{components,pages,utils}/**/*.{ts,tsx}`, `features/${d}/ui.ts`];
const TESTS = ["features/*/__tests__/**", "platform/__tests__/**"];
const CONTROLLERS = (d) => [`features/${d}/*Controller.ts`];
const REPOSITORIES = (d) => [`features/${d}/*{Repository,Storage}.ts`];

// Andre domæners interne filer (alt andet end deres index.ts og ui.ts).
const otherDomainInternals = (d) => `^@/features/(?!${d}(?:/|$))[a-z]+/(?!ui$).+$`;
// Andre domæners index.ts (serverkode) eller interne filer; kun ui.ts er tilladt.
const otherDomainsExceptUi = (d) => `^@/features/(?!${d}(?:/|$))[a-z]+(?:/(?!ui$).*)?$`;
// Domænets egen serverkode, både med @/-sti og relativt (fx i ui.ts).
const ownServerCode = (d) => `^(?:@/features/${d}/|\./)(?:ai/.*|[^/]*(?:Repository|Storage|Controller|Service))$`;
const SERVER_ONLY =
  "^(?:@/platform/(?:db|base|middleware)/|@/platform/[^/]*(?:Repository|cronController|imageProcessingService)$|@supabase/)";
const ANY_FEATURE_EXCEPT_UI = "^@/features/[a-z]+(?:/(?!ui$).*)?$";
const ANY_CONTROLLER = "^(?:\\./|@/features/[a-z]+/)[^/]*Controller$";
const ANY_SERVICE = "^(?:\\./|@/features/[a-z]+/)[^/]*Service$";
const DOMAIN_BASE = (d) => [otherDomainInternals(d), "^@/features/[a-z]+/ui$", "^@/components/", "^@/app/"];
const DOMAIN_MSG = (d) => `features/${d} må bruge platform/, lib/ og andre domæners index.ts, aldrig deres interne filer eller UI.`;

const domainRules = DOMAINS.flatMap((d) => [
  // Controllers: forretningsregler. Controllere kalder ikke hinanden (delt logik hører i en service).
  layer(CONTROLLERS(d), [...DOMAIN_BASE(d), ANY_CONTROLLER], `${DOMAIN_MSG(d)} Controllere kalder ikke hinanden.`),
  // Repositories: eneste sted, der kalder Supabase; de kender hverken controllere eller services.
  layer(REPOSITORIES(d), [...DOMAIN_BASE(d), ANY_CONTROLLER, ANY_SERVICE], `${DOMAIN_MSG(d)} Repositories kender ikke controllere eller services.`),
  // Øvrig serverkode i domænet: services, ai/ og index.ts.
  layer(
    [`features/${d}/**/*.ts`],
    [...DOMAIN_BASE(d), ANY_CONTROLLER],
    `${DOMAIN_MSG(d)} Services kalder ikke controllere.`,
    [...UI_FILES(d), ...TESTS, ...(PURE[d] ?? []), ...CONTROLLERS(d), ...REPOSITORIES(d), `features/${d}/index.ts`],
  ),
  layer([`features/${d}/index.ts`], [...DOMAIN_BASE(d)], DOMAIN_MSG(d)),
  // Ren kode: domænegrænserne gælder, og derudover ingen repositories, Supabase eller netværksklienter.
  ...(PURE[d]
    ? [
        layer(
          PURE[d],
          [...DOMAIN_BASE(d), "^@/features/[a-z]+$", "^(?:\\./|\\.\\./|@/features/[a-z]+/)[^/]*(?:Repository|Storage|Controller)$", SERVER_ONLY, "^openai$", "^sharp$"],
          "Ren kode (ai-reglerne, rankingService, availabilityService) må ikke importere andre domæner, repositories, Supabase eller netværksklienter.",
        ),
      ]
    : []),
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
  // Sider og layouts i app/ videresender til features/<domæne>/pages (eller ui.ts) og bruger kun platform/middleware til vagter.
  layer(
    ["app/**/*.{ts,tsx}"],
    ["^@/features/[a-z]+(?:/(?!pages/|ui$).*)?$", "^@/platform/(?:db|base)/", "^@/platform/[^/]*(?:Repository|cronController|imageProcessingService)$", "^@supabase/"],
    "Sider og layouts i app/ videresender til features/<domæne>/pages eller ui.ts og bruger kun platform/middleware til vagter.",
    ["app/api/**"],
  ),
  // Routes kalder én controller. Kun klientfabrikken må hentes fra platform/db.
  layer(
    ["app/api/**/*.ts"],
    [
      "^@/features/[a-z]+$",
      "^@/features/[a-z]+/(?:ai/.*|ui|[^/]*(?:Repository|Storage|Service)|components/.*|pages/.*|utils/.*)$",
      "^@/platform/db/(?!supabase$)",
      "^@/platform/base/",
      "^@/platform/[^/]*(?:Repository|imageProcessingService)$",
      "^@supabase/",
    ],
    "Routes kalder én controller og bruger platform/middleware. Supabase kaldes kun i repositories.",
  ),
  // platform/ er tværgående og kender ingen domæner (undtagen cron og session-/vilkårsvagten, se nedenfor).
  layer(
    ["platform/**/*.{ts,tsx}"],
    ["^@/features/", "^@/app/", "^@/components/"],
    "platform/ er tværgående og må ikke importere domæner, app/ eller UI-komponenter.",
    [...TESTS, "platform/cronController.ts", "platform/middleware/{session,termsGate}.ts", "platform/ui-utils/**", "platform/base/**"],
  ),
  // Basisklasserne kender ikke konkrete klasser (arv går kun nedad).
  layer(
    ["platform/base/**/*.ts"],
    ["^@/features/", "^@/app/", "^@/components/", "^@/platform/(?!db/|middleware/http$)"],
    "platform/base/ må kun bruge platform/db, lib/ og ApiError og kender ikke de konkrete klasser.",
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
    ".next-test/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Patient-appen (Expo) har sin egen konfiguration (architecture 13.2).
    "mobile/**",
  ]),
]);

export default eslintConfig;
