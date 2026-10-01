import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderRbacSeedSql } from "../lib/permissions/sql";

export const RBAC_SEED_PATH = resolve(__dirname, "../supabase/migrations/20261001000400_rbac_seed.sql");

writeFileSync(RBAC_SEED_PATH, renderRbacSeedSql());
console.log(`Wrote ${RBAC_SEED_PATH}`);
