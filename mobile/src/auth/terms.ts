// Vilkårstokenet i SecureStore (architecture 13.3). Samme sted som sessionens tokens, ikke i AsyncStorage.
import * as SecureStore from "expo-secure-store";

// Vilkårstoken fra POST /api/terms/accept (architecture 2.5 punkt 3, 13.3). Sendes som X-Terms-Token.
const TERMS_KEY = "tm.termsToken";

// Læser, gemmer og sletter vilkårstokenet.
export function getTermsToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TERMS_KEY);
}

export function saveTermsToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TERMS_KEY, token);
}

export function clearTermsToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TERMS_KEY);
}
