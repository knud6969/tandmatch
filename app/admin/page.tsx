import { redirect } from "next/navigation";
import { AREA_HOME } from "@/lib/common/navigation/areas";

// /admin omdirigerer til admins startside (features/admin 6.4).
export default function AdminIndexPage() {
  redirect(AREA_HOME.admin);
}
