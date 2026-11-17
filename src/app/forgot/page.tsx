import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ForgotForm } from "@/components/PasswordForms";

export const metadata = { title: "Forgot password" };

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8"><Logo /></Link>
      <div className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="font-serif text-2xl font-semibold">Forgot your password?</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Enter your email and we&apos;ll send a link to choose a new one.</p>
        <ForgotForm />
      </div>
    </div>
  );
}
