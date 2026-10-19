module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^~/(.*)$": "<rootDir>/src/$1",
    "^@/lib/(.*)$": "<rootDir>/../lib/$1",
  },
};
