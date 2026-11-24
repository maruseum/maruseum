import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { customerNeeds, customers, properties } from "@/db/schema";
import type { CustomerRecord, PropertyRecord } from "./validate";
import { addressKey, phoneDigits } from "./values";

const nameKey = (name: string, company: string | null) => `${name.replace(/\s/g, "")}|${(company ?? "").replace(/\s/g, "")}`;

/** 행 번호 → 중복 사유. DB 에 이미 있거나, 같은 파일 안에서 앞 행과 겹치는 경우. */
export async function findCustomerDuplicates(records: CustomerRecord[]): Promise<Map<number, string>> {
  const existing = await db
    .select({ phone: customers.phone, name: customers.name, companyName: customers.companyName })
    .from(customers);
  const phones = new Set(existing.map((c) => phoneDigits(c.phone)).filter((d) => d.length >= 9));
  const names = new Set(existing.filter((c) => c.companyName).map((c) => nameKey(c.name, c.companyName)));

  const dup = new Map<number, string>();
  const seenPhone = new Map<string, number>();
  const seenName = new Map<string, number>();
  for (const r of records) {
    const d = phoneDigits(r.customer.phone);
    const nk = r.customer.companyName ? nameKey(r.customer.name, r.customer.companyName) : null;
    if (d.length >= 9 && phones.has(d)) dup.set(r.row, "같은 연락처의 고객이 이미 있습니다");
    else if (d.length >= 9 && seenPhone.has(d)) dup.set(r.row, `${seenPhone.get(d)}행과 연락처가 같습니다`);
    else if (nk && names.has(nk)) dup.set(r.row, "같은 이름·회사의 고객이 이미 있습니다");
    else if (nk && seenName.has(nk)) dup.set(r.row, `${seenName.get(nk)}행과 이름·회사가 같습니다`);
    if (d.length >= 9 && !seenPhone.has(d)) seenPhone.set(d, r.row);
    if (nk && !seenName.has(nk)) seenName.set(nk, r.row);
  }
  return dup;
}

export async function findPropertyDuplicates(records: PropertyRecord[]): Promise<Map<number, string>> {
  const existing = await db.select({ address: properties.address }).from(properties);
  const keys = new Set(existing.map((p) => addressKey(p.address)));
  const dup = new Map<number, string>();
  const seen = new Map<string, number>();
  for (const r of records) {
    const k = addressKey(r.property.address);
    if (keys.has(k)) dup.set(r.row, "같은 지번 주소의 물건이 이미 있습니다");
    else if (seen.has(k)) dup.set(r.row, `${seen.get(k)}행과 주소가 같습니다`);
    if (!seen.has(k)) seen.set(k, r.row);
  }
  return dup;
}

const CHUNK = 500;

/** 고객 + 니즈 v1 을 한 트랜잭션으로 넣습니다. */
export async function insertCustomers(userId: string, records: CustomerRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  return db.transaction(async (tx) => {
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const ids = await tx
        .insert(customers)
        .values(chunk.map((r) => r.customer))
        .returning({ id: customers.id });
      const needsRows = chunk.flatMap((r, j) =>
        r.needs
          ? [{ customerId: ids[j].id, version: 1, ...r.needs, reason: "엑셀 가져오기", source: "import" as const, changedBy: userId }]
          : [],
      );
      if (needsRows.length) await tx.insert(customerNeeds).values(needsRows);
    }
    return records.length;
  });
}

export async function insertProperties(userId: string, records: PropertyRecord[]): Promise<number> {
  if (records.length === 0) return 0;
  return db.transaction(async (tx) => {
    for (let i = 0; i < records.length; i += CHUNK) {
      await tx.insert(properties).values(
        records.slice(i, i + CHUNK).map((r) => ({ ...r.property, createdBy: userId, updatedAt: sql`now()` })),
      );
    }
    return records.length;
  });
}
