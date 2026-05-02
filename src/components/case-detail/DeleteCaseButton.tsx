"use client";

import { useState, useTransition } from "react";
import { deleteCase } from "@/app/cases/[id]/upload-actions";

export function DeleteCaseButton({
  case_id,
  brand_label,
}: {
  case_id: string;
  brand_label: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    const ok = window.confirm(
      `정말 삭제할까요?\n\n[${brand_label}]\n\n이 케이스의 제품·매출·BSR·광고·클러스터·분석결과가 모두 삭제됩니다. (콘텐츠/인플루언서는 보존)`,
    );
    if (!ok) return;

    setError(null);
    start(async () => {
      const r = await deleteCase(case_id);
      // 성공 시 redirect로 페이지 이동, 여기 도달 못 함.
      // 실패 시에만 아래로 떨어짐.
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn"
        style={{
          background: "white",
          color: "var(--color-accent)",
          border: "1px solid var(--color-accent-soft)",
          padding: "6px 12px",
          fontSize: 11,
        }}
      >
        {pending ? "삭제 중…" : "케이스 삭제"}
      </button>
      {error && (
        <span
          style={{
            fontSize: 11,
            color: "var(--color-accent)",
            fontWeight: 600,
            marginLeft: 8,
          }}
        >
          ✕ {error}
        </span>
      )}
    </>
  );
}
