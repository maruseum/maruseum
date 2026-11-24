import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth/dal";

const TEMPLATES = {
  customers: {
    file: "고객_가져오기_양식.xlsx",
    sheet: "고객",
    headers: ["이름", "회사명", "구분", "연락처", "이메일", "유입경로", "진행단계", "담당자", "희망지역", "물건종류", "매입목적", "예산", "희망면적(평)", "용도지역", "기타조건", "메모"],
    example: ["홍길동(예시)", "(주)예시물류", "법인", "010-0000-0000", "", "소개", "상담", "", "경기 화성, 경기 평택", "토지", "물류창고 신축", "30억~50억", "2000~3000", "계획관리지역", "4차선 접도", "예시 행입니다. 지우고 쓰세요."],
  },
  properties: {
    file: "물건_가져오기_양식.xlsx",
    sheet: "물건",
    headers: ["물건명", "종류", "상태", "지번주소", "도로명주소", "지역", "지목", "용도지역", "토지면적(㎡)", "건물연면적(㎡)", "희망가", "소유자", "소유자연락처", "담당자", "설명"],
    example: ["화성 예시 부지(예시)", "토지", "진행중", "경기도 화성시 ○○면 ○○리 123", "", "", "임야", "계획관리지역", "9917", "", "45억", "", "", "", "예시 행입니다. 지우고 쓰세요."],
  },
} as const;

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return new Response("로그인이 필요합니다.", { status: 401 });
  const kind = new URL(request.url).searchParams.get("kind") === "properties" ? "properties" : "customers";
  const t = TEMPLATES[kind];
  const headers: readonly string[] = t.headers;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t.sheet);
  ws.addRow([...headers]).font = { bold: true };
  ws.addRow([...t.example]).font = { color: { argb: "FF888888" } };
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(10, h.length * 2 + 4);
    // 연락처는 텍스트 서식 (엑셀이 숫자로 바꾸며 앞자리 0을 지우지 않도록)
    if (h.includes("연락처")) col.numFmt = "@";
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(t.file)}`,
      "Cache-Control": "no-store",
    },
  });
}
