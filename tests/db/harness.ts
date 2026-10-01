import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const root = join(__dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

/** Boots PGlite with the Supabase stub and every migration applied in order. */
export async function createTestDb({ seed = false }: { seed?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { citext, pg_trgm, pgcrypto } });
  await db.exec(readFileSync(join(__dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  if (seed) await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
  return db;
}

export async function createUser(db: PGlite, email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [
    email,
  ]);
  return rows[0].id;
}

/** Runs `fn` as the anonymous (signed-out) API role. */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

/** Runs `fn` as the `authenticated` role with the given user's JWT claims, then rolls back role state. */
export async function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}
