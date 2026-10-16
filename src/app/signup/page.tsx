import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold">Start your free workspace</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Your clients stay private to your account.</p>
        <Suspense>
          <AuthForm mode="signup" inviteRequired={Boolean(process.env.SIGNUP_CODE)} />
        </Suspense>
      </div>
    </div>
  );
}
