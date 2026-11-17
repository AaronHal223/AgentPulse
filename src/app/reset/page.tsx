import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ResetForm } from "@/components/PasswordForms";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" as const };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold">Choose a new password</h1>
        {token ? (
          <>
            <p className="mt-1 mb-6 text-sm text-muted">You&apos;ll be logged in as soon as it&apos;s saved.</p>
            <ResetForm token={token} />
          </>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            This link is missing its code. <Link href="/forgot" className="font-semibold text-ink underline">Ask for a new one.</Link>
          </p>
        )}
      </div>
    </div>
  );
}
