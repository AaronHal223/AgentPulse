export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

/**
 * Hands text to the phone's share sheet (Messages, Mail, WhatsApp…), or copies it where there
 * isn't one. Must be called straight from a tap, or phones refuse to open the sheet.
 */
export async function shareText(text: string): Promise<ShareResult> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Some browsers have the function but block it; copying still works.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
