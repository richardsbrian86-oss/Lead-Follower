import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Must stay relative: drizzle-kit 0.31.10 concatenates "./" + this path when
  // re-reading snapshot files on a second `generate` run. An absolute `out`
  // produces a malformed "./<absolute path>" and crashes with ENOENT. Only
  // works because our scripts always invoke drizzle-kit with cwd = lib/db.
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
