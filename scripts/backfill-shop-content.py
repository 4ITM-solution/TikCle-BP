#!/usr/bin/env python3
"""A1 정확 백필 — contents.is_shop_content를 Kalodata 영상 xlsx url 매칭으로 세팅.

근거: 사용자 확정 기준 "TT샵 콘텐츠 구분 = Kalodata 영상 xlsx url 매칭" (BP_재설계_v2 핵심 결정).
019의 프록시 백필(샵 크리에이터 전체 영상 = 28.5% 과대)은 ORCH 반려로 제거 — 이 스크립트가 대체.
멱등: is_shop_content=false인 행만 true로 올림 (재실행 안전). 삭제 없음 — R12 비해당(추가성 UPDATE).
실행: python3 scripts/backfill-shop-content.py  (.env.local의 service key 사용)
"""
import json, os, urllib.request, urllib.parse

env = {}
for line in open(os.path.join(os.path.dirname(__file__), '..', '.env.local')):
    if '=' in line and not line.startswith('#'):
        k, _, v = line.strip().partition('=')
        env[k] = v.strip('"')
URL, KEY = env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']


def req(method, path, body=None, prefer=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    r = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
                               data=json.dumps(body).encode() if body is not None else None,
                               headers=h)
    with urllib.request.urlopen(r) as resp:
        return resp.headers.get('content-range'), resp.read().decode()


def count(path):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Prefer': 'count=exact', 'Range': '0-0'}
    r = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=h)
    with urllib.request.urlopen(r) as resp:
        cr = resp.headers.get('content-range') or '*/0'
        return int(cr.split('/')[-1])


_, cases_raw = req('GET', 'cases?select=id,brand_id,country&key_stats-%3Ekalodata_videos_xlsx=not.is.null')
cases = json.loads(cases_raw)
print(f'대상 {len(cases)}케이스')

grand = 0
for c in cases:
    _, ks_raw = req('GET', f"cases?select=key_stats-%3Ekalodata_videos_xlsx&id=eq.{c['id']}")
    rows = json.loads(ks_raw)[0]['kalodata_videos_xlsx'] or []
    urls = sorted({r.get('video_url') for r in rows if isinstance(r, dict) and r.get('video_url')})
    before = count(f"contents?select=id&brand_id=eq.{c['brand_id']}&country=eq.{urllib.parse.quote(c['country'])}&is_shop_content=eq.true")
    for i in range(0, len(urls), 25):
        chunk = urls[i:i + 25]
        inlist = ','.join('"' + u.replace('"', '') + '"' for u in chunk)
        q = urllib.parse.quote(f'({inlist})', safe='(),"')
        path = (f"contents?brand_id=eq.{c['brand_id']}&country=eq.{urllib.parse.quote(c['country'])}"
                f"&url=in.{q}&is_shop_content=eq.false")
        try:
            req('PATCH', path, body={'is_shop_content': True}, prefer='return=headers-only')
        except Exception as e:
            print(f"  경고 {c['id'][:8]} chunk {i}: {e}")
    after = count(f"contents?select=id&brand_id=eq.{c['brand_id']}&country=eq.{urllib.parse.quote(c['country'])}&is_shop_content=eq.true")
    grand += after - before
    print(f"  {c['id'][:8]} xlsx urls={len(urls):5d} → 신규 플래그 {after - before}")

total = count('contents?select=id&is_shop_content=eq.true')
print(f'\n총 신규 플래그: {grand} · 전체 is_shop_content=true: {total}')
