import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─── 직원·팀 ────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["admin", "manager", "agent"]);

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("agent"),
  teamId: integer("team_id").references(() => teams.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// 세션 토큰은 원문이 아닌 SHA-256 해시만 저장합니다.
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// 누가 언제 무엇을 했는지 (개인정보 열람·수정 추적용)
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

// ─── 물건 ──────────────────────────────────────────────────

export const propertyType = pgEnum("property_type", ["land", "building", "land_building"]);
export const propertyStatus = pgEnum("property_status", [
  "available",
  "negotiating",
  "on_hold",
  "sold",
  "withdrawn",
]);

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    propertyType: propertyType("property_type").notNull(),
    status: propertyStatus("status").notNull().default("available"),
    region: text("region"), // 예: 경기 화성시
    address: text("address").notNull(), // 지번 주소
    roadAddress: text("road_address"),
    pnu: text("pnu"), // 필지고유번호 (공공데이터 연동용)
    landCategory: text("land_category"), // 지목
    zoning: text("zoning"), // 용도지역
    landAreaM2: numeric("land_area_m2", { precision: 12, scale: 2, mode: "number" }),
    buildingAreaM2: numeric("building_area_m2", { precision: 12, scale: 2, mode: "number" }),
    askingPrice: bigint("asking_price", { mode: "number" }), // 만원
    ownerName: text("owner_name"),
    ownerPhone: text("owner_phone"),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("properties_status_idx").on(t.status), index("properties_region_idx").on(t.region)],
);

// ─── 고객 ──────────────────────────────────────────────────

export const customerType = pgEnum("customer_type", ["individual", "corporation"]);
export const customerStage = pgEnum("customer_stage", [
  "new",
  "consulting",
  "proposing",
  "site_visit",
  "negotiating",
  "contracted",
  "closed",
  "lost",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    customerType: customerType("customer_type").notNull().default("individual"),
    companyName: text("company_name"),
    phone: text("phone"),
    email: text("email"),
    source: text("source"), // 유입 경로
    stage: customerStage("stage").notNull().default("new"),
    memo: text("memo"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_assignee_idx").on(t.assigneeId),
    index("customers_stage_idx").on(t.stage),
    index("customers_phone_idx").on(t.phone),
  ],
);

// 고객 니즈는 덮어쓰지 않고 버전으로 쌓아 변화 이력을 남깁니다.
export const needsSource = pgEnum("needs_source", ["manual", "call_summary", "import"]);

export const customerNeeds = pgTable(
  "customer_needs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    regions: text("regions").array().notNull().default(sql`'{}'::text[]`),
    propertyTypes: text("property_types").array().notNull().default(sql`'{}'::text[]`),
    purpose: text("purpose"),
    budgetMin: bigint("budget_min", { mode: "number" }), // 만원
    budgetMax: bigint("budget_max", { mode: "number" }), // 만원
    landAreaMinM2: numeric("land_area_min_m2", { precision: 12, scale: 2, mode: "number" }),
    landAreaMaxM2: numeric("land_area_max_m2", { precision: 12, scale: 2, mode: "number" }),
    zonings: text("zonings").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    reason: text("reason"), // 변경 사유
    source: needsSource("source").notNull().default("manual"),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customer_needs_version_uq").on(t.customerId, t.version)],
);

// ─── 상담·연락 이력, 할 일 ───────────────────────────────────

export const interactionKind = pgEnum("interaction_kind", [
  "call",
  "meeting",
  "site_visit",
  "message",
  "memo",
]);

export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: interactionKind("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("interactions_customer_idx").on(t.customerId, t.occurredAt)],
);

export const taskStatus = pgEnum("task_status", ["open", "done", "canceled"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: taskStatus("status").notNull().default("open"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeId, t.status, t.dueAt)],
);

export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerNeeds = typeof customerNeeds.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
