import type { Customer, Property } from "@/db/schema";
import { toPyeong } from "@/lib/format";
import {
  CUSTOMER_TYPE_LABEL,
  entries,
  PROPERTY_STATUS_LABEL,
  PROPERTY_TYPE_LABEL,
} from "@/lib/labels";
import type { NeedsSnapshot } from "@/lib/needs";
import { Field, Input, Select, Textarea } from "./ui";

const round1 = (v: number) => Math.round(v * 10) / 10;

export function CustomerFields({
  customer,
  staff,
  canAssign,
  defaultAssigneeId,
}: {
  customer?: Customer;
  staff: [string, string][];
  canAssign: boolean;
  defaultAssigneeId?: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="고객 이름 *">
        <Input name="name" required defaultValue={customer?.name} />
      </Field>
      <Field label="구분">
        <Select name="customerType" options={entries(CUSTOMER_TYPE_LABEL)} defaultValue={customer?.customerType ?? "individual"} />
      </Field>
      <Field label="회사명 (법인)">
        <Input name="companyName" defaultValue={customer?.companyName ?? ""} />
      </Field>
      <Field label="연락처">
        <Input name="phone" type="tel" placeholder="010-0000-0000" defaultValue={customer?.phone ?? ""} />
      </Field>
      <Field label="이메일">
        <Input name="email" type="email" defaultValue={customer?.email ?? ""} />
      </Field>
      <Field label="유입 경로" hint="예: 소개, 기존 고객, 광고, 지인">
        <Input name="source" defaultValue={customer?.source ?? ""} />
      </Field>
      {canAssign && (
        <Field label="담당자">
          <Select
            name="assigneeId"
            options={staff}
            placeholder="미지정"
            defaultValue={customer ? (customer.assigneeId ?? "") : (defaultAssigneeId ?? "")}
          />
        </Field>
      )}
      <div className="sm:col-span-2">
        <Field label="메모">
          <Textarea name="memo" defaultValue={customer?.memo ?? ""} />
        </Field>
      </div>
    </div>
  );
}

export function NeedsFields({ needs }: { needs?: NeedsSnapshot | null }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="희망 지역" hint="쉼표로 구분. 예: 경기 화성, 평택, 용인 처인구">
        <Input name="needs_regions" defaultValue={needs?.regions.join(", ") ?? ""} />
      </Field>
      <Field label="매입 목적" hint="예: 물류창고 신축, 사옥, 임대 수익, 개발">
        <Input name="needs_purpose" defaultValue={needs?.purpose ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <span className="mb-1 block text-sm font-medium text-slate-700">물건 종류</span>
        <div className="flex flex-wrap gap-4">
          {entries(PROPERTY_TYPE_LABEL).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="needs_types" value={value} defaultChecked={needs?.propertyTypes.includes(value)} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <Field label="예산 하한 (만원)" hint="예: 30억 → 300000">
        <Input name="needs_budgetMin" inputMode="numeric" defaultValue={needs?.budgetMin ?? ""} />
      </Field>
      <Field label="예산 상한 (만원)">
        <Input name="needs_budgetMax" inputMode="numeric" defaultValue={needs?.budgetMax ?? ""} />
      </Field>
      <Field label="토지면적 하한 (평)">
        <Input
          name="needs_landMin"
          inputMode="decimal"
          defaultValue={needs?.landAreaMinM2 != null ? round1(toPyeong(needs.landAreaMinM2)) : ""}
        />
      </Field>
      <Field label="토지면적 상한 (평)">
        <Input
          name="needs_landMax"
          inputMode="decimal"
          defaultValue={needs?.landAreaMaxM2 != null ? round1(toPyeong(needs.landAreaMaxM2)) : ""}
        />
      </Field>
      <input type="hidden" name="needs_areaUnit" value="pyeong" />
      <Field label="용도지역" hint="쉼표로 구분. 예: 계획관리지역, 일반공업지역">
        <Input name="needs_zonings" defaultValue={needs?.zonings.join(", ") ?? ""} />
      </Field>
      <Field label="기타 조건">
        <Input name="needs_notes" placeholder="예: 4차선 접도, 고압 전력 필요" defaultValue={needs?.notes ?? ""} />
      </Field>
    </div>
  );
}

export function PropertyFields({ property, staff }: { property?: Property; staff: [string, string][] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="물건명 *" hint="목록에서 알아보기 쉬운 이름. 예: 화성 장안면 계획관리 3천평">
          <Input name="title" required defaultValue={property?.title} />
        </Field>
      </div>
      <Field label="종류 *">
        <Select name="propertyType" options={entries(PROPERTY_TYPE_LABEL)} defaultValue={property?.propertyType ?? "land"} />
      </Field>
      <Field label="상태">
        <Select name="status" options={entries(PROPERTY_STATUS_LABEL)} defaultValue={property?.status ?? "available"} />
      </Field>
      <Field label="지역" hint="예: 경기 화성시 (고객 희망 지역과 매칭에 사용)">
        <Input name="region" defaultValue={property?.region ?? ""} />
      </Field>
      <Field label="지번 주소 *">
        <Input name="address" required placeholder="경기도 화성시 장안면 ○○리 123-4" defaultValue={property?.address} />
      </Field>
      <Field label="도로명 주소">
        <Input name="roadAddress" defaultValue={property?.roadAddress ?? ""} />
      </Field>
      <Field label="지목">
        <Input name="landCategory" placeholder="전, 답, 임야, 대, 공장용지…" defaultValue={property?.landCategory ?? ""} />
      </Field>
      <Field label="용도지역">
        <Input name="zoning" placeholder="계획관리지역" defaultValue={property?.zoning ?? ""} />
      </Field>
      <Field label="희망가 (만원)" hint="예: 45억 → 450000">
        <Input name="askingPrice" inputMode="numeric" defaultValue={property?.askingPrice ?? ""} />
      </Field>
      <Field label="토지면적 (㎡)">
        <Input name="landAreaM2" inputMode="decimal" defaultValue={property?.landAreaM2 ?? ""} />
      </Field>
      <Field label="건물 연면적 (㎡)">
        <Input name="buildingAreaM2" inputMode="decimal" defaultValue={property?.buildingAreaM2 ?? ""} />
      </Field>
      <Field label="소유자(매도인)">
        <Input name="ownerName" defaultValue={property?.ownerName ?? ""} />
      </Field>
      <Field label="소유자 연락처">
        <Input name="ownerPhone" type="tel" defaultValue={property?.ownerPhone ?? ""} />
      </Field>
      <Field label="담당자">
        <Select name="assigneeId" options={staff} placeholder="미지정" defaultValue={property?.assigneeId ?? ""} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="설명">
          <Textarea name="description" rows={4} defaultValue={property?.description ?? ""} />
        </Field>
      </div>
    </div>
  );
}
