"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  uploadKalodata,
  uploadKalodataCreatorsXlsx,
  uploadKalodataVideosXlsx,
  uploadKalodataCategoryRanking,
} from "@/app/cases/[id]/upload-actions";
import { UploadDropzone } from "./UploadDropzone";

/**
 * TikTok Shop SEA 케이스용 Kalodata 데이터 업로드.
 *
 * Kalodata Pro 플랜은 API/대량 export 없이 화면만 보임. 다운로드는
 * 제한된 크레딧 소비라 화면 통째 텍스트 복붙이 가장 안전한 경로.
 * 한 번 복붙으로 Brand KPI + Products(Top N) + Creators(Top N) 일괄 적재.
 */
export function KalodataSection({
  case_id,
  productCount,
}: {
  case_id: string;
  productCount: number;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // Creator xlsx 업로드 상태
  const [xlsxPending, xlsxStart] = useTransition();
  const [xlsxMsg, setXlsxMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Video xlsx 업로드 상태
  const [videoXlsxPending, videoXlsxStart] = useTransition();
  const [videoXlsxMsg, setVideoXlsxMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  // Category Ranking 적재 상태 (C1)
  const [rankText, setRankText] = useState("");
  const [rankPending, rankStart] = useTransition();
  const [rankMsg, setRankMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function submitRanking() {
    rankStart(async () => {
      const fd = new FormData();
      fd.append("text", rankText);
      const r = await uploadKalodataCategoryRanking(case_id, fd);
      setRankMsg(
        r.ok ? { type: "ok", text: r.message } : { type: "err", text: r.error },
      );
      if (r.ok) {
        setRankText("");
        router.refresh();
      }
    });
  }

  function submit() {
    start(async () => {
      const fd = new FormData();
      fd.append("text", text);
      const r = await uploadKalodata(case_id, fd);
      setMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) {
        setText("");
        router.refresh();
      }
    });
  }

  function submitXlsx(file: File) {
    xlsxStart(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadKalodataCreatorsXlsx(case_id, fd);
      setXlsxMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  function submitVideoXlsx(file: File) {
    videoXlsxStart(async () => {
      const fd = new FormData();
      fd.append("file", file);
      const r = await uploadKalodataVideosXlsx(case_id, fd);
      setVideoXlsxMsg(
        r.ok
          ? { type: "ok", text: r.message }
          : { type: "err", text: r.error },
      );
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="field">
      <label className="field-label">
        Kalodata 매출 데이터 (TikTok Shop SEA){" "}
        <span className="req">*</span>
      </label>
      <span
        className="field-help"
        style={{ marginBottom: 10, display: "block" }}
      >
        Kalodata 브랜드 페이지(예: SKIN1004 Thailand) 통째 텍스트 복사 →
        붙여넣기. <b>크레딧 0 소비</b>, 다운로드 X. Brand KPI + Products(Top N)
        + Creators(Top N) 한 번에 적재돼요.
      </span>

      <div
        style={{
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          Kalodata 브랜드 페이지 통째 복사
          {productCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: "var(--color-pos)",
                marginLeft: 6,
                fontWeight: 600,
              }}
            >
              ✓ 제품 {productCount}개 적재됨
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          📌 Kalodata 로그인 → 브랜드 페이지(SKIN1004 Thailand 등) → 페이지
          <b> 전체 텍스트 선택</b>(Cmd+A) → 복사 → 아래 붙여넣기.
          <br />
          "Core Metrics", "Creator(N items)", "Product(N items)" 섹션이 모두 한
          텍스트 안에 있으면 파싱 OK.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="SKIN1004 Thailand&#10;Follow&#10;BRAND&#10;...&#10;Core Metrics&#10;Last 30 Days (04/19 ~ 05/18)&#10;Revenue&#10;$1.10m&#10;..."
          rows={8}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "8px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 4,
            resize: "vertical",
            background: "white",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={pending || text.trim().length === 0}
            className="btn"
            style={{
              background: "var(--color-ink)",
              color: "white",
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 5,
              opacity: pending || text.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {pending ? "처리 중…" : "Kalodata 업로드"}
          </button>
          {msg && (
            <span
              style={{
                fontSize: 11,
                color:
                  msg.type === "ok"
                    ? "var(--color-pos)"
                    : "var(--color-accent)",
                fontWeight: 600,
                lineHeight: 1.5,
              }}
            >
              {msg.type === "ok" ? "✓ " : "✕ "}
              {msg.text}
            </span>
          )}
        </div>
      </div>

      {/* Creator xlsx Export 업로드 (Top N) */}
      <div
        style={{
          marginTop: 12,
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          크리에이터 디테일 (xlsx Export, Top N — 1 entry = 1 크레딧)
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          Kalodata → 브랜드 페이지 → Creator 섹션 → <b>Export</b> 다이얼로그에서
          Range 1~500 지정해서 xlsx 받음. <b>Live/Video GMV 분리, 컨택, 팔로워,
          데뷔일</b> 다 들어있음. 추천: Top 500 (500 크레딧/브랜드, 월 4,000 ÷ 500 = 8 브랜드).
        </div>
        <UploadDropzone
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          hint="xlsx 또는 csv (LIST_CREATOR 시트)"
          pending={xlsxPending}
          onFile={submitXlsx}
        />
        {xlsxMsg && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color:
                xlsxMsg.type === "ok"
                  ? "var(--color-pos)"
                  : "var(--color-accent)",
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            {xlsxMsg.type === "ok" ? "✓ " : "✕ "}
            {xlsxMsg.text}
          </div>
        )}
      </div>

      {/* Video xlsx Export 업로드 (Top N — 영상별 매출 + ROAS + 영상-제품 매핑) */}
      <div
        style={{
          marginTop: 12,
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          비디오 디테일 (xlsx Export, Top N — Video Export 4,000 크레딧 별도 풀)
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          Kalodata → 브랜드 페이지 → Video 섹션 → <b>Export</b> 다이얼로그에서
          Range 1~500 지정해서 xlsx 받음. <b>TikTokUrl + 영상-제품 매핑 + Ad
          ROAS/Spend/CPA + GPM</b> 다 포함. TikTokUrl 박히면 Phase 4b Vision /
          클러스터링 자동 분석. <b>엑솔릿이 못 잡는 Shop 영상</b>(해시태그/멘션 없음)
          이게 유일한 경로. 추천: Top 500 (Video 풀 4,000 ÷ 500 = 8 브랜드).
        </div>
        <UploadDropzone
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          hint="xlsx 또는 csv (LIST_VIDEO 시트 — TikTokUrl 포함)"
          pending={videoXlsxPending}
          onFile={submitVideoXlsx}
        />
        {videoXlsxMsg && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color:
                videoXlsxMsg.type === "ok"
                  ? "var(--color-pos)"
                  : "var(--color-accent)",
              fontWeight: 600,
              lineHeight: 1.5,
            }}
          >
            {videoXlsxMsg.type === "ok" ? "✓ " : "✕ "}
            {videoXlsxMsg.text}
          </div>
        )}
      </div>

      {/* C1: Category Ranking 시계열 (텍스트 paste — TSV: date\trank) */}
      <div
        style={{
          marginTop: 12,
          padding: "14px 16px",
          background: "var(--color-g25)",
          borderRadius: 8,
          border: "1px solid var(--color-g100)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--color-ink)",
            marginBottom: 4,
          }}
        >
          ★ 카테고리 ranking 시계열 (선택) — D 섹션 차트 채움
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-g500)",
            marginBottom: 8,
            lineHeight: 1.5,
          }}
        >
          Kalodata Brand 페이지 → Category Ranking 데이터 캡처 후 줄당{" "}
          <b>date{"<TAB>"}rank</b> 형식으로 paste (TSV / CSV / space 다 ok). 예:{" "}
          <code>2025-05-01    23</code>. 크레딧 0 소비.
        </div>
        <textarea
          value={rankText}
          onChange={(e) => setRankText(e.target.value)}
          placeholder="2025-05-01\t23&#10;2025-05-08\t18&#10;2025-05-15\t12&#10;..."
          rows={5}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "8px 10px",
            border: "1px solid var(--color-g200)",
            borderRadius: 4,
            resize: "vertical",
            background: "white",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={submitRanking}
            disabled={rankPending || rankText.trim().length === 0}
            className="btn"
            style={{
              background: "var(--color-ink)",
              color: "white",
              padding: "6px 14px",
              fontSize: 12,
              borderRadius: 5,
              opacity: rankPending || rankText.trim().length === 0 ? 0.5 : 1,
            }}
          >
            {rankPending ? "처리 중…" : "Ranking 적재"}
          </button>
          {rankMsg && (
            <span
              style={{
                fontSize: 11,
                color: rankMsg.type === "ok" ? "var(--color-pos)" : "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              {rankMsg.type === "ok" ? "✓ " : "✕ "}
              {rankMsg.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
