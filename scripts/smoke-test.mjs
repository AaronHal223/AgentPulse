/**
 * End-to-end smoke test against a running AgentPulse server (no API keys needed).
 *   BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 * Signs up a throwaway agent, creates a client, edits it, loads every page and the app files
 * that make it installable on phones. Exits non-zero on the first failure.
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
let cookie = "";
let failures = 0;

async function req(path, { method = "GET", body, expect = 200, redirect = "manual" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect;
  console.log(`${ok ? "✓" : "✗"} ${method} ${path} → ${res.status}`);
  if (!ok) {
    failures++;
    console.log("   ", (await res.text()).slice(0, 300));
  }
  return res;
}

async function main() {
  // Public pages and app-install files
  await req("/");
  await req("/login");
  await req("/signup");
  await req("/api/health");
  const manifest = await (await req("/manifest.webmanifest")).json();
  if (!manifest.icons?.length || manifest.display !== "standalone") {
    failures++;
    console.log("✗ manifest is missing icons or standalone display");
  }
  await req("/sw.js");
  await req("/offline.html");
  await req("/icons/icon-512.png");
  await req("/icons/icon-maskable-512.png");
  await req("/apple-icon.png");
  await req("/dashboard", { expect: 307 }); // logged out → redirected

  // Account + client flow
  const email = `smoke-${Date.now()}@example.com`;
  await req("/api/auth/signup", { method: "POST", body: { name: "Smoke Test", email, password: "smoke-test-123" } });
  const created = await (
    await req("/api/buyers", {
      method: "POST",
      body: { name: "Test Client", intent: "buy", budgetMax: 500000, areas: ["Collingswood NJ"], anchors: [{ label: "Work", address: "Camden, NJ" }] },
    })
  ).json();
  const id = created.buyer?.id;
  if (!id) {
    failures++;
    console.log("✗ client was not created");
  } else {
    await req(`/api/buyers/${id}`, { method: "PATCH", body: { mustHaves: ["Yard"], budgetMin: null } });
    for (const p of ["/dashboard", "/buyers", "/buyers/new", `/buyers/${id}`, "/settings"]) await req(p);
    await req(`/api/buyers/${id}`, { method: "DELETE" });
  }
  await req("/api/settings", { method: "PATCH", body: { briefEnabled: false } });

  if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll smoke checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
