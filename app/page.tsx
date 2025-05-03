// ルートへのアクセスは /login へ転送
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
