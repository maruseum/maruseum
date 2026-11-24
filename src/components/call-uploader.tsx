"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Item = { name: string; state: "waiting" | "uploading" | "done" | "error"; progress: number; message?: string };
type UploadBody = { error?: string; customerId?: string | null };

/** 업로드 진행률을 보려면 XHR 을 써야 합니다 (fetch 는 업로드 진행률 이벤트가 없음). */
function upload(file: File, customerId: string | undefined, onProgress: (p: number) => void) {
  return new Promise<{ ok: boolean; body: UploadBody }>((resolve) => {
    const fd = new FormData();
    fd.append("file", file);
    if (customerId) fd.append("customerId", customerId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/recordings");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: UploadBody = {};
      try {
        body = JSON.parse(xhr.responseText) as UploadBody;
      } catch {
        body = { error: `서버 오류 (${xhr.status})` };
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    xhr.onerror = () => resolve({ ok: false, body: { error: "네트워크 오류" } });
    xhr.send(fd);
  });
}

export function CallUploader({ customerId, compact = false }: { customerId?: string; compact?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.state === "uploading" || i.state === "waiting");

  async function start(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    setItems(list.map((f) => ({ name: f.name, state: "waiting", progress: 0 })));
    const patch = (idx: number, p: Partial<Item>) =>
      setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...p } : it)));
    for (let i = 0; i < list.length; i++) {
      patch(i, { state: "uploading" });
      const res = await upload(list[i], customerId, (p) => patch(i, { progress: p }));
      if (res.ok) {
        patch(i, { state: "done", progress: 1, message: customerId || res.body.customerId ? "요약 중…" : "고객 연결 필요" });
      } else {
        patch(i, { state: "error", message: res.body.error ?? "업로드 실패" });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div className={compact ? "" : "rounded-lg border-2 border-dashed border-slate-300 bg-white p-5"}>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
        {busy ? "올리는 중…" : "통화 녹음 올리기"}
        <input
          ref={inputRef}
          type="file"
          name="recordings"
          multiple
          accept="audio/*,.m4a,.amr,.3gp"
          className="sr-only"
          disabled={busy}
          onChange={(e) => start(e.target.files)}
        />
      </label>
      {!compact && (
        <p className="mt-2 text-xs text-slate-500">
          갤럭시: 파일 선택 → 내장 메모리 → Recordings → Call 폴더. 여러 개를 한 번에 골라도 됩니다. 파일명의 이름·번호로 고객을 자동 연결합니다.
        </p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs" aria-live="polite">
          {items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-700">{it.name}</span>
              {it.state === "uploading" && <span className="text-slate-500">{Math.round(it.progress * 100)}%</span>}
              {it.state === "waiting" && <span className="text-slate-400">대기</span>}
              {it.state === "done" && <span className="text-emerald-700">✓ {it.message}</span>}
              {it.state === "error" && (
                <span role="alert" className="text-red-600">
                  {it.message}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
