"use client";

import Link from "next/link";
import { startTransition, useOptimistic, useState } from "react";
import { moveStage } from "@/app/(app)/customers/actions";

export interface BoardCard {
  id: string;
  name: string;
  companyName: string | null;
  stage: string;
  assigneeName: string | null;
  summary: string | null; // 희망 지역 · 예산
  lastContactLabel: string;
  stale: boolean;
}

export interface BoardColumn {
  key: string;
  label: string;
}

/**
 * 진행 단계 칸반. 카드를 다른 열로 끌어 놓거나, 카드의 선택 상자로 단계를 바꿉니다.
 * 바꾼 결과는 바로 화면에 반영하고(낙관적 업데이트), 서버에서 실패하면 되돌린 뒤 오류를 보여줍니다.
 */
export function PipelineBoard({ columns, cards }: { columns: BoardColumn[]; cards: BoardCard[] }) {
  const [optimistic, applyMove] = useOptimistic(cards, (state, move: { id: string; stage: string }) =>
    state.map((c) => (c.id === move.id ? { ...c, stage: move.stage } : c)),
  );
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function move(id: string, stage: string) {
    const card = optimistic.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    setError(null);
    startTransition(async () => {
      applyMove({ id, stage });
      const err = await moveStage(id, stage);
      if (err) setError(`${card.name}: ${err}`);
    });
  }

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map((col) => {
          const items = optimistic.filter((c) => c.stage === col.key);
          return (
            <section
              key={col.key}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(col.key);
              }}
              onDragLeave={() => setDragOver((k) => (k === col.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                move(e.dataTransfer.getData("text/plain"), col.key);
              }}
              className={`flex w-64 shrink-0 flex-col rounded-lg border p-2 ${
                dragOver === col.key ? "border-slate-500 bg-slate-100" : "border-slate-200 bg-slate-100/60"
              }`}
            >
              <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-slate-700">
                {col.label}
                <span className="rounded-full bg-white px-2 text-xs font-normal text-slate-500">{items.length}</span>
              </h2>
              <ul className="flex min-h-16 flex-col gap-2">
                {items.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="cursor-grab rounded-md border border-slate-200 bg-white p-3 text-sm shadow-sm active:cursor-grabbing"
                  >
                    <Link href={`/customers/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.name}
                    </Link>
                    {c.companyName && <span className="ml-1 text-xs text-slate-500">{c.companyName}</span>}
                    {c.summary && <p className="mt-1 text-xs text-slate-600">{c.summary}</p>}
                    <p className={`mt-1 text-xs ${c.stale ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {c.assigneeName ?? "미지정"} · {c.lastContactLabel}
                    </p>
                    <select
                      aria-label={`${c.name} 단계 변경`}
                      value={c.stage}
                      onChange={(e) => move(c.id, e.target.value)}
                      className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-xs text-slate-600"
                    >
                      {columns.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
