"use client";
import { ErrorView } from "@/components/ErrorView";

/** Catches failures above the app pages too (for example while checking who is logged in). */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="px-4 py-10">
      <ErrorView {...props} />
    </div>
  );
}
