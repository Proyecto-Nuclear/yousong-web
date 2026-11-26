import { connection } from "next/server";
import { Suspense } from "react";
import { auth } from "@/auth";
import { AdminPanel } from "@/components/admin-panel";

async function AuthenticatedPanel() {
  await connection();
  const session = await auth();
  return (
    <AdminPanel authenticated={Boolean(session)} roles={session?.roles ?? []} />
  );
}
export default function Home() {
  return (
    <Suspense fallback={<output>Cargando tu panel…</output>}>
      <AuthenticatedPanel />
    </Suspense>
  );
}
