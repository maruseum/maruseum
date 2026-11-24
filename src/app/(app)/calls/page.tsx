import { AutoRefresh } from "@/components/auto-refresh";
import { CallUploader } from "@/components/call-uploader";
import { isProcessing, RecordingList } from "@/components/recording-list";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/dal";
import { listRecordings } from "@/lib/calls/queries";

const RETENTION_DAYS = Number(process.env.RECORDING_AUDIO_RETENTION_DAYS ?? 180);

export default async function CallsPage({ searchParams }: PageProps<"/calls">) {
  const user = await requireUser();
  const sp = await searchParams;
  const mine = sp.mine === "1";
  const rows = await listRecordings(user, { onlyMine: mine });
  const unlinked = rows.filter((r) => !r.customerId && r.status !== "failed");
  const processing = rows.some((r) => isProcessing(r.status));

  return (
    <>
      <AutoRefresh active={processing} />
      <PageHeader
        title="통화 녹음"
        description="녹음을 올리면 음성 인식 → AI 요약 → 고객 상담 기록·할 일까지 자동으로 남깁니다."
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <CallUploader />
          {unlinked.length > 0 && (
            <Card title={`고객 연결 필요 ${unlinked.length}`}>
              <p className="mb-2 text-xs text-slate-500">
                파일명의 이름·번호와 같은 고객을 찾지 못했습니다. 녹음을 열어 고객을 선택하면 상담 기록에 반영됩니다.
              </p>
              <RecordingList rows={unlinked} showCustomer={false} />
            </Card>
          )}
          <Card
            title="최근 녹음"
            actions={
              <a href={mine ? "/calls" : "/calls?mine=1"} className="text-xs text-slate-500 underline">
                {mine ? "볼 수 있는 전체" : "내가 올린 것만"}
              </a>
            }
          >
            <RecordingList rows={rows} />
          </Card>
        </div>
        <Card title="개인정보 안내">
          <ul className="list-disc space-y-2 pl-4 text-xs text-slate-600">
            <li>고객에게 통화 녹음과 AI 요약 사실을 알린 통화만 올려 주세요.</li>
            <li>음성은 외부 음성 인식 서비스(OpenAI)로, 녹취록은 AI 요약 서비스(Anthropic)로 전송돼 처리됩니다.</li>
            <li>음성 파일은 {RETENTION_DAYS}일 후 자동 삭제되고, 녹취록과 요약은 고객 기록으로 남습니다. 필요하면 녹음 화면에서 바로 지울 수 있습니다.</li>
            <li>녹음은 올린 본인과 해당 고객을 볼 수 있는 직원(담당자·팀장·관리자)만 볼 수 있고, 재생 기록이 감사 로그에 남습니다.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
