"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { properties } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { canEditProperty } from "@/lib/authz";
import { parseNumberInput } from "@/lib/format";
import { FormError, handleForm, nonNegative, oneOf, required, str, type ActionState } from "@/lib/form";
import { PROPERTY_STATUS_LABEL, PROPERTY_TYPE_LABEL } from "@/lib/labels";
import { regionFromAddress } from "@/lib/region";

const TYPES = Object.keys(PROPERTY_TYPE_LABEL) as (keyof typeof PROPERTY_TYPE_LABEL)[];
const STATUSES = Object.keys(PROPERTY_STATUS_LABEL) as (keyof typeof PROPERTY_STATUS_LABEL)[];

function readProperty(fd: FormData) {
  const address = required(fd, "address", "지번 주소");
  return {
    title: required(fd, "title", "물건명"),
    propertyType: oneOf(str(fd, "propertyType"), TYPES, "물건 종류"),
    status: oneOf(str(fd, "status") ?? "available", STATUSES, "상태"),
    // 지역을 비워 두면 지번 주소에서 "시도 시군구" 를 채웁니다 (매칭에 사용)
    region: str(fd, "region") ?? regionFromAddress(address),
    address,
    roadAddress: str(fd, "roadAddress"),
    landCategory: str(fd, "landCategory"),
    zoning: str(fd, "zoning"),
    askingPrice: nonNegative(parseNumberInput(fd.get("askingPrice")), "희망가"),
    landAreaM2: nonNegative(parseNumberInput(fd.get("landAreaM2")), "토지면적"),
    buildingAreaM2: nonNegative(parseNumberInput(fd.get("buildingAreaM2")), "건물 연면적"),
    ownerName: str(fd, "ownerName"),
    ownerPhone: str(fd, "ownerPhone"),
    assigneeId: str(fd, "assigneeId"),
    description: str(fd, "description"),
  };
}

export async function createProperty(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let id = "";
  const res = await handleForm(async () => {
    const values = readProperty(fd);
    const [p] = await db
      .insert(properties)
      .values({ ...values, assigneeId: values.assigneeId ?? user.id, createdBy: user.id })
      .returning({ id: properties.id });
    id = p.id;
    await audit({ userId: user.id, action: "create", entityType: "property", entityId: id });
  });
  if (res?.error) return res;
  redirect(`/properties/${id}`);
}

export async function updateProperty(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const res = await handleForm(async () => {
    const [p] = await db.select().from(properties).where(eq(properties.id, id));
    if (!p) throw new FormError("물건을 찾을 수 없습니다.");
    if (!canEditProperty(user, p)) throw new FormError("이 물건을 수정할 권한이 없습니다.");
    const values = readProperty(fd);
    await db.update(properties).set({ ...values, updatedAt: new Date() }).where(eq(properties.id, id));
    const changed = p.status !== values.status || p.askingPrice !== values.askingPrice;
    await audit({
      userId: user.id,
      action: "update",
      entityType: "property",
      entityId: id,
      detail: changed ? { status: [p.status, values.status], askingPrice: [p.askingPrice, values.askingPrice] } : null,
    });
  });
  if (res?.error) return res;
  redirect(`/properties/${id}`);
}
