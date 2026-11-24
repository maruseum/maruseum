import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** 테스트 DB를 비우고 최신 마이그레이션을 적용합니다. TEST_DATABASE_URL 이 없으면 DB 테스트는 건너뜁니다. */
export default async function setup() {
  try {
    process.loadEnvFile(".env");
  } catch {}
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  if (url === process.env.DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL 이 운영 DATABASE_URL 과 같습니다. 별도 테스트 DB를 지정하세요.");
  }
  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
