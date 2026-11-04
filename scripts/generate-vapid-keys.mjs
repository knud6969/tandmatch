// Laver et nyt VAPID-nøglepar til web push (RFC 8292) og skriver det til terminalen. Gemmer intet.
// Kopiér de tre linjer til .env.local (aldrig til git). Den private nøgle må kun stå på serveren.
// Brug: node scripts/generate-vapid-keys.mjs
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]);

console.log("Læg disse linjer i .env.local (VAPID_PRIVATE_KEY er hemmelig):\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey.toString("base64url")}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log("VAPID_SUBJECT=mailto:support@tandmatch.dk");
