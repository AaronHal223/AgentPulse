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
  const live = await req("/api/live");
  for (const h of ["strict-transport-security", "x-frame-options", "x-content-type-options"]) {
    if (!live.headers.get(h)) {
      failures++;
      console.log(`✗ missing security header ${h}`);
    }
  }
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

  // A login cookie for an account that no longer exists must not trap the browser in a redirect loop.
  if (process.env.AUTH_SECRET) {
    const { SignJWT } = await import("jose");
    const token = await new SignJWT({ sub: "account-that-does-not-exist" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
    cookie = `ap_session=${token}`;
    const dash = await req("/dashboard", { expect: [303, 307, 308] });
    const to = dash.headers.get("location") || "";
    if (!to.includes("/api/auth/expired")) {
      failures++;
      console.log(`✗ stale login should go to /api/auth/expired, went to ${to}`);
    }
    const exp = await req("/api/auth/expired", { expect: 307 });
    if (!(exp.headers.get("location") || "").includes("/login") || !/ap_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(exp.headers.get("set-cookie") || "")) {
      failures++;
      console.log("✗ /api/auth/expired should clear the cookie and send to /login");
    }
    cookie = "";
  }

  // Password guessing gets blocked.
  const victim = `guess-${Date.now()}@example.com`;
  for (let i = 0; i < 10; i++) await req("/api/auth/login", { method: "POST", body: { email: victim, password: `wrong-${i}` }, expect: 401 });
  await req("/api/auth/login", { method: "POST", body: { email: victim, password: "wrong-again" }, expect: 429 });

  // Cron endpoints refuse requests without the secret.
  await req("/api/cron/send-briefs", { expect: [401, 503] });

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
