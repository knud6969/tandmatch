import type { ReactNode } from "react";
import { guardArea } from "@/platform/middleware/areaGuard";

// Områdevagt for admin (architecture 6.5, features/admin 6.4): uden login til /login, forkert rolle til eget område eller forsiden.
export default async function AdminAreaLayout({ children }: { children: ReactNode }) {
  await guardArea("admin", "/admin");
  return children;
}
