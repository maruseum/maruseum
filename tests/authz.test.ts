import { describe, expect, it } from "vitest";
import { canEditProperty, canReassign, canViewCustomer, type Actor } from "@/lib/authz";

const admin: Actor = { id: "a", role: "admin", teamId: null };
const manager: Actor = { id: "m", role: "manager", teamId: 1 };
const agent: Actor = { id: "x", role: "agent", teamId: 1 };

describe("canViewCustomer", () => {
  it("관리자는 전부", () => {
    expect(canViewCustomer(admin, { id: "other", teamId: 2 })).toBe(true);
  });
  it("직원은 본인 담당만", () => {
    expect(canViewCustomer(agent, { id: "x", teamId: 1 })).toBe(true);
    expect(canViewCustomer(agent, { id: "y", teamId: 1 })).toBe(false);
    expect(canViewCustomer(agent, { id: null, teamId: null })).toBe(false);
  });
  it("팀장은 본인·같은 팀·미지정", () => {
    expect(canViewCustomer(manager, { id: "y", teamId: 1 })).toBe(true);
    expect(canViewCustomer(manager, { id: null, teamId: null })).toBe(true);
    expect(canViewCustomer(manager, { id: "z", teamId: 2 })).toBe(false);
  });
  it("팀이 없는 팀장은 다른 팀원 고객을 못 본다", () => {
    expect(canViewCustomer({ ...manager, teamId: null }, { id: "z", teamId: null })).toBe(false);
  });
});

describe("기타 권한", () => {
  it("담당자 변경은 관리자·팀장만", () => {
    expect(canReassign(admin)).toBe(true);
    expect(canReassign(manager)).toBe(true);
    expect(canReassign(agent)).toBe(false);
  });
  it("물건 수정: 직원은 본인 담당·등록 물건만", () => {
    expect(canEditProperty(agent, { assigneeId: "x", createdBy: null })).toBe(true);
    expect(canEditProperty(agent, { assigneeId: null, createdBy: "x" })).toBe(true);
    expect(canEditProperty(agent, { assigneeId: "y", createdBy: "y" })).toBe(false);
    expect(canEditProperty(manager, { assigneeId: "y", createdBy: "y" })).toBe(true);
  });
});
