#!/bin/bash
# F1 클러스터 잔재 청소 재개 — Anthropic 크레딧 충전 후 실행 (2026-07-07)
# 대상 25케이스 = 크레딧 소진 실패 8 + Inngest 오류 1 + 미발송 16
# 규칙: R10(10개 웨이브·완료 확인 후 다음), R11(끝나면 serve-stats), R7(force 겹쳐 쏘기 금지)
# 사용: cd ~/티클/TikCle-BP && bash scripts/f1-resume-waves.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source .env.local

CASES=(
  # 웨이브1 실패분 (크레딧 소진 8 + Inngest 오류 1)
  0d5673a2-e279-4ed9-a3ae-2ba37cf67b7f 6769b0bb-a4bf-4a19-9365-ec878941172d
  bf73e541-1e02-4b89-ab98-b4267940e20d 3be66bbd-59da-4887-851e-1a1ce38b5941
  8d5cf229-eab4-49af-9a1d-95eb16ea3918 a5d8f68f-3a5e-4ca7-ad68-9ec5bb9379d1
  1adea24e-d9df-4dc6-a962-a4bdfc2319ef 32fcd8ac-d8ec-4f64-a3c5-421600f29528
  677aeb50-55e4-456e-9727-b84cef868913
  # 미발송 16
  adbeef7a-252e-4138-bd93-811a0301fdde 553244b1-9a56-4253-8798-1aac2e662f2a
  752be564-bbed-49d8-b4d4-dddf822aa1e4 085c6294-0986-485c-92f6-8cdaf75d5c5c
  3dc22dda-aacf-4357-b985-ffa18c53e9bb 93a31a68-99aa-45e2-a3f5-dd75c3ee6350
  11821fa3-9818-41cb-97f8-33c73e108d23 5716d635-9e10-4e88-8d19-83c319b20407
  5f106fc6-4461-4d5c-a0c9-ef19bf2bcb56 c31e5a68-dccb-4af7-978c-45ebf8af422d
  73a557a9-5305-4c7e-a15d-11bd252d66d1 83fcd709-f7de-4030-9325-53e309af8bf0
  358bc62e-509c-48b2-aa92-eb1a691d1107 c0fb9933-973e-46e0-b9fa-1dce2d479975
  0da903a8-ef1b-42b3-b6a2-b5f24ddb4b38 08cc8911-cd6b-41c9-bbef-1e85c91e61db
)

fire() { # $1=case_id $2=phase
  curl -s -X POST "https://inn.gs/e/$INNGEST_EVENT_KEY" -H 'Content-Type: application/json' \
    -d "{\"name\":\"case/phase.requested\",\"data\":{\"case_id\":\"$1\",\"phase\":\"$2\",\"force\":true}}" -o /dev/null -w "%{http_code}"
}

count_done() { # $1=phase $2=since-iso — completed distinct case 수 (오늘 발송분)
  curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/phase_runs?select=case_id,status&phase=eq.$1&started_at=gte.$2" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(len({x['case_id'] for x in d if x['status']=='completed'}), len({x['case_id'] for x in d if x['status']=='failed'}))"
}

run_phase_in_waves() { # $1=phase $2=poll_max(회, 30s 간격)
  local PHASE=$1 POLLMAX=$2
  local SINCE; SINCE=$(date -u +%Y-%m-%dT%H:%M:%SZ)  # Z 서픽스 — "+00:00"은 URL에서 공백으로 깨져 PostgREST 400 (2026-07-07 실사고)
  local TOTAL=${#CASES[@]} SENT=0
  for ((w=0; w<TOTAL; w+=10)); do
    local WAVE=("${CASES[@]:w:10}")
    echo "▶ $PHASE 웨이브 $((w/10+1)): ${#WAVE[@]}건 발송"
    for c in "${WAVE[@]}"; do printf "  %s %s\n" "$(fire "$c" "$PHASE")" "$c"; done
    SENT=$((SENT+${#WAVE[@]}))
    for ((i=1; i<=POLLMAX; i++)); do
      sleep 30
      read -r DONE FAILED <<< "$(count_done "$PHASE" "$SINCE")"
      echo "  poll $i: completed=$DONE failed=$FAILED / sent=$SENT"
      if [ "$FAILED" -gt 0 ]; then
        echo "❌ 실패 발생 — 중단. phase_runs에서 error 확인 (크레딧 재소진이면 충전 후 재실행: 이 스크립트는 완료분 자동 skip 안 하므로 CASES에서 완료분 제거 후 재실행)"; exit 1
      fi
      [ "$DONE" -ge "$SENT" ] && break
      [ "$i" -eq "$POLLMAX" ] && { echo "⚠️ 타임아웃 — 미완료 상태로 다음 웨이브 보류. 수동 확인 필요"; exit 1; }
    done
  done
}

echo "=== 1/3 interpret-cluster 25케이스 (예상 ~\$20, 케이스당 1~10분) ==="
run_phase_in_waves interpret-cluster 30
echo "=== 2/3 serve-stats 동기화 (무료) ==="
run_phase_in_waves serve-stats 10
echo "=== 3/3 legacy 잔재 최종 카운트 ==="
curl -s -o /dev/null -D - "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/content_clusters?select=id&run_tag=is.null&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "Prefer: count=exact" \
  | tr -d '\r' | grep -i content-range
echo "(참고: validated-0 4케이스 = 542e·ec60·a600·f724 는 WS5 §2 수정 전까지 잔재 유지가 정상)"
echo "완료 — 설계 문서 §6에 F1 종결 로그 추가할 것"
