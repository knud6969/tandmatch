import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Lagregler for appen (docs/architecture.md 13.2). Type-imports er tilladt på tværs af lag.
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
            { regex: "^\\.\\./", message: "Brug \"~/...\" eller \"@/lib/...\" i stedet for \"../\"." },
          ],
        },
      ],
    },
  };
}

// Serverens lag, som appen aldrig må importere (kun lib/ deles).
const NOT_ROOT_LAYERS = [
  "@/models/*",
  "@/controllers/*",
  "@/services/*",
  "@/middleware/*",
  "@/views/*",
  "@/app/*",
  "@/lib/navigation/*",
];

// Lint håndhæver lagene i appen (architecture 13.2): app/ -> screens -> components, og api/auth kun mod hinanden og lib/.
export default defineConfig([
  globalIgnores(["node_modules/**", ".expo/**", "dist/**", "expo-env.d.ts"]),
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Appen importerer kun lib/ fra repoets rod, aldrig serverens lag.
      "no-restricted-imports": ["error", { patterns: [{ group: NOT_ROOT_LAYERS, message: "Appen må kun bruge @/lib/{types,schemas,constants,domain}." }] }],
      // fetch må kun bruges i src/api/client.ts (se override nedenfor).
      "no-restricted-globals": ["error", { name: "fetch", message: "Brug apiRequest fra ~/api/client; fetch findes kun i src/api/client.ts." }],
    },
  },
  layer(["app/**/*.{ts,tsx}"], [...NOT_ROOT_LAYERS, "~/api/*", "~/components/*", "~/hooks/*", "~/utils/*"], "Rutefiler re-eksporterer en skærm og har ingen logik. Layouts må bruge ~/auth/*."),
  layer(["src/screens/**/*.{ts,tsx}"], NOT_ROOT_LAYERS, "Skærme bruger ~/components, ~/api, ~/hooks, ~/utils, ~/auth og @/lib."),
  layer(["src/components/**/*.{ts,tsx}"], [...NOT_ROOT_LAYERS, "~/api/*", "~/screens/*", "~/auth/*"], "Komponenter får data og handlinger som props og kalder ikke ~/api eller ~/auth."),
  layer(["src/api/**/*.{ts,tsx}"], [...NOT_ROOT_LAYERS, "~/screens/*", "~/components/*", "~/hooks/*", "~/utils/*", "~/auth/*", "!~/auth/tokens"], "~/api må kun bruge ~/auth/tokens og @/lib."),
  layer(["src/auth/**/*.{ts,tsx}"], [...NOT_ROOT_LAYERS, "~/screens/*", "~/components/*", "~/hooks/*", "~/utils/*", "~/api/*"], "~/auth må kun bruge ~/api/* i session-context.tsx.", ["src/auth/session-context.tsx"]),
  {
    files: ["src/api/client.ts", "tests/**/*.{ts,tsx}"],
    rules: { "no-restricted-globals": "off" },
  },
  {
    files: ["*.config.js", "metro.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
