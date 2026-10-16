/**
 * Loads .env / .env.local for scripts the same way Next.js does for the app, so `npm run build`
 * migrates the database in DATABASE_URL_UNPOOLED / DATABASE_URL written by `neon env pull` or
 * `neon deploy`. Values already set in the environment (e.g. on Render) always win.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
