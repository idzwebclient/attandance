import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log masuk" };

const NOTICES: Record<string, string> = {
  inactive: "Akaun anda tidak aktif. Hubungi admin.",
  "no-profile": "Akaun anda belum didaftarkan sebagai pekerja. Hubungi admin.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold text-brand">Hadir</div>
          <p className="text-sm text-muted">Sistem kehadiran pekerja</p>
        </div>
        <Card>
          <LoginForm
            next={typeof next === "string" ? next : "/"}
            notice={typeof error === "string" ? NOTICES[error] : undefined}
          />
        </Card>
      </div>
    </main>
  );
}
