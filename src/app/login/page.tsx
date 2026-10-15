import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Log in to see today’s brief.</p>
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </div>
  );
}
