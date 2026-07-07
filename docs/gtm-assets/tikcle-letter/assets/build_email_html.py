#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TikCle 레터 발송용 HTML 이메일 빌더.

6월호(첫 호) 실제 발송본 스타일을 그대로 파라미터화했다. 콘텐츠 dict 하나를 채워서
build(letter) -> HTML 문자열을 얻고, 파일로 저장한다. 표는 쓰지 않는다(이메일 호환).

색: 잉크 #1c1c1a / 퍼플 #9a8cff / 진퍼플 #3c3489 / 라일락박스 #f7f6ff·테두리 #e7e3ff / 배경 #f4f4f2.

──────────────────────────────────────────────────────────────────────────
콘텐츠 dict 스키마
──────────────────────────────────────────────────────────────────────────
letter = {
  "header": {
    "period": "2026년 7월호",              # 헤더 큰 글씨
    "tagline": "이번 달 시장과 1위 브랜드의 운영",  # 헤더 아래 회색 한 줄
  },
  "intro": [                                 # 인트로 문단들(문자열 리스트). <b>…</b> 강조 가능
    "안녕하세요, TikCle 팀이에요 :)",
    "이번 호에서는 …",
  ],
  "blocks": [                                # 순서대로 렌더됨
    # ① 일반 섹션(시장 소식 등). body는 블록 리스트.
    {"type":"section", "title":"📍 이번 달 새로운 시장 소식 — …",
     "body":[
        {"p":"문단 텍스트 <b>강조</b> 가능"},
        {"bullets":["항목1","항목2"]},
     ]},

    # ② 디깅 브랜드(벤치마크·라일락 박스). 이번 호 메인.
    {"type":"digging", "title":"🔍 이번 달 디깅 브랜드 — 조선미녀",
     "intro":"박스 첫 문단",
     "items":[                               # ①②③ 소제목 블록
        {"h":"① 소재 하나를 두 가지로", "p":"설명",
         "img":{"src":"data:image/…또는 URL","w":150,"cap":"캡션","href":"클릭링크"}},  # img 선택
        {"h":"② …", "p":"설명"},
     ],
     "xy":[                                  # ❌→✅ 정리(흰 박스). 각 [통념, 진짜]
        ["조회수 터진 콘텐츠 = 좋은 광고 소재","광고 소재와 도달 콘텐츠는 다른 물건"],
     ],
     "check":"👉 우리 브랜드 점검: …"},        # 선택

    # ③ 웨비나 배너(다크). 그달 웨비나 있을 때만.
    {"type":"webinar", "kicker":"📢 이번 주 웨비나 · 신청 받는 중",
     "title":"동남아 틱톡샵, 크리에이터 군단 만들기", "desc":"7/2(목) 15:00 · 20분 · Zoom",
     "cta_text":"웨비나 신청하기 →", "cta_href":"https://forms.gle/…"},

    # ④ 더 깊게 읽어보기(딥다이브 블로그).
    {"type":"readmore", "title":"📖 더 깊게 읽어보기",
     "post_title":"인플루언서 시딩 콘텐츠, 퍼포먼스 광고 소재로 활용하는 법",
     "desc":"한 줄 요약", "cta_text":"블로그에서 읽기 →", "cta_href":"https://www.4am.team/blog"},

    # ⑤ 새소식(번호 다이제스트).
    {"type":"news", "title":"📣 새소식",
     "items":["이번 주 목요일 웨비나 …","신규 블로그 2편 …"]},
  ],
  "closing": [                               # 마치며 문단들
    "이번 달 핵심은 하나예요 — …",
    "우리 브랜드엔 어떤 설계가 맞을지 궁금하면, TikCle 진단서(14문항) 한 번 해보세요 ☕️",
  ],
  # footer 는 기본값(회사정보) 사용. 바꾸려면 letter["footer_html"] 에 직접 넣기.
}

사용:
  from build_email_html import build
  html = build(letter)
  open("레터_2026년_7월호_email.html","w",encoding="utf-8").write(html)
"""

INK = "#1c1c1a"; PURPLE = "#9a8cff"; DPURPLE = "#3c3489"
LILAC_BG = "#f7f6ff"; LILAC_BD = "#e7e3ff"; PAGE_BG = "#f4f4f2"
FONT = "'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif"

DEFAULT_FOOTER = (
    '<tr><td style="background-color:%s;padding:22px 32px;">'
    '<p style="margin:0;color:#ffffff;font-size:13px;font-weight:bold;">TikCle · 새벽네시</p>'
    '<p style="margin:14px 0 0;color:#6f6f6f;font-size:11px;line-height:1.6;">'
    '주식회사 새벽네시 · 대표 이은솔, 김경은 · 사업자등록번호 111-81-94199<br>'
    '서울특별시 강남구 논현동 158-13, 3-4F · 문의 team-og@4am.team</p>'
    '<p style="margin:8px 0 0;color:#6f6f6f;font-size:11px;line-height:1.6;">'
    '본 메일은 TikCle 서비스에 관심을 보여주신 분들께 발송되었습니다. 더 이상 받고 싶지 않으시면 '
    '<a href="mailto:team-og@4am.team?subject=수신거부" style="color:#9a9a9a;text-decoration:underline;">수신거부</a>'
    '를 눌러주세요.</p></td></tr>' % INK
)


def _row(inner, pad="24px 32px 0"):
    return '<tr><td style="padding:%s;">%s</td></tr>' % (pad, inner)


def _p(text, size=14, color="#444444", mt=0):
    return ('<p style="margin:%dpx 0 0;font-size:%dpx;line-height:1.7;color:%s;">%s</p>'
            % (mt, size, color, text))


def _section_header(title):
    return ('<p style="margin:0 0 12px;font-size:17px;font-weight:bold;color:%s;'
            'border-left:4px solid %s;padding-left:10px;">%s</p>' % (INK, INK, title))


def _divider():
    return ('<tr><td style="padding:24px 32px 0;"><table role="presentation" width="100%" '
            'cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid '
            '#eeeeee;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>')


def _button(text, href, bg=INK, fg="#ffffff"):
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
            '<td style="background-color:%s;"><a href="%s" style="display:inline-block;color:%s;'
            'text-decoration:none;font-size:14px;font-weight:bold;padding:11px 20px;">%s</a>'
            '</td></tr></table>' % (bg, href, fg, text))


def _thumb(img):
    src = img["src"]; w = img.get("w", 150); cap = img.get("cap", ""); href = img.get("href", "#")
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 2px;">'
            '<tr><td><a href="%s" style="text-decoration:none;"><img src="%s" width="%d" '
            'style="display:block;width:%dpx;height:auto;border:1px solid %s;" alt="%s"></a>'
            '<div style="font-size:11px;color:#999999;margin-top:4px;">%s</div></td></tr></table>'
            % (href, src, w, w, LILAC_BD, cap, cap))


def _render_body_blocks(body):
    out = []
    for b in body:
        if "p" in b:
            out.append(_p(b["p"], mt=(12 if out else 0)))
        elif "bullets" in b:
            items = "<br>".join("• " + x for x in b["bullets"])
            out.append('<p style="margin:%dpx 0 0;font-size:14px;line-height:1.9;color:#444444;">%s</p>'
                       % (12 if out else 0, items))
        elif "img" in b:
            out.append(_thumb(b["img"]))
    return "".join(out)


def _block_section(bl):
    return _row(_section_header(bl["title"]) + _render_body_blocks(bl.get("body", [])))


def _block_digging(bl):
    inner = [_section_header(bl["title"])]
    box = ['<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" '
           'style="background-color:%s;border:1px solid %s;"><tr><td style="padding:20px 22px;">' % (LILAC_BG, LILAC_BD)]
    if bl.get("intro"):
        box.append('<p style="margin:0;font-size:14px;line-height:1.75;color:#333333;">%s</p>' % bl["intro"])
    for it in bl.get("items", []):
        box.append('<p style="margin:18px 0 4px;font-size:14px;font-weight:bold;color:%s;">%s</p>' % (DPURPLE, it["h"]))
        if it.get("p"):
            box.append(_p(it["p"]))
        if it.get("img"):
            box.append(_thumb(it["img"]))
    if bl.get("xy"):
        rows = "<br>".join('❌ %s &nbsp;→&nbsp; ✅ <b>%s</b>' % (a, b) for a, b in bl["xy"])
        box.append('<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" '
                   'style="background-color:#ffffff;margin-top:18px;"><tr><td style="padding:14px 16px;">'
                   '<p style="margin:0;font-size:13px;line-height:1.9;color:#333333;">%s</p></td></tr></table>' % rows)
    if bl.get("check"):
        box.append('<p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#666666;">%s</p>' % bl["check"])
    box.append('</td></tr></table>')
    # digging 박스는 좌우 여백을 살짝 다르게(원본과 동일)
    return _row("".join(inner)) + '<tr><td style="padding:0 24px;">%s</td></tr>' % "".join(box)


def _block_webinar(bl):
    inner = ('<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" '
             'style="background-color:%s;"><tr><td style="padding:22px 24px;">'
             '<p style="margin:0;color:%s;font-size:12px;font-weight:bold;letter-spacing:1px;">%s</p>'
             '<p style="margin:8px 0 0;color:#ffffff;font-size:18px;font-weight:bold;">%s</p>'
             '<p style="margin:6px 0 14px;color:#bdbdbd;font-size:13px;">%s</p>%s'
             '</td></tr></table>' % (
                 INK, PURPLE, bl.get("kicker", "📢 웨비나 신청 받는 중"), bl["title"],
                 bl.get("desc", ""), _button(bl.get("cta_text", "신청하기 →"), bl["cta_href"], bg=PURPLE, fg=INK)))
    return _row(inner, pad="20px 32px 0")


def _block_readmore(bl):
    inner = (_section_header(bl.get("title", "📖 더 깊게 읽어보기"))
             + '<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#444444;"><b>%s</b><br>%s</p>'
               % (bl["post_title"], bl.get("desc", ""))
             + _button(bl.get("cta_text", "블로그에서 읽기 →"), bl["cta_href"]))
    return _row(inner)


def _block_news(bl):
    items = "<br>".join("• " + x for x in bl.get("items", []))
    inner = (_section_header(bl.get("title", "📣 새소식"))
             + '<p style="margin:0;font-size:14px;line-height:1.9;color:#444444;">%s</p>' % items)
    return _row(inner)


_DISPATCH = {
    "section": _block_section, "digging": _block_digging, "webinar": _block_webinar,
    "readmore": _block_readmore, "news": _block_news,
}


def build(letter):
    h = letter.get("header", {})
    parts = []
    # 헤더
    parts.append(
        '<tr><td style="background-color:%s;padding:28px 32px;">'
        '<p style="margin:0;color:%s;font-size:13px;font-weight:bold;letter-spacing:1px;">TikCle Letter</p>'
        '<p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:bold;">%s</p>'
        '<p style="margin:8px 0 0;color:#bdbdbd;font-size:13px;">%s</p></td></tr>'
        % (INK, PURPLE, h.get("period", ""), h.get("tagline", "")))
    # 인트로
    intro = "".join(_p(t, size=15, color="#222222", mt=(14 if i else 0)) for i, t in enumerate(letter.get("intro", [])))
    parts.append(_row(intro, pad="28px 32px 4px"))
    # 블록들
    for bl in letter.get("blocks", []):
        fn = _DISPATCH.get(bl["type"])
        if not fn:
            continue
        if bl["type"] in ("section", "digging", "readmore", "news"):
            parts.append(_divider())
        parts.append(fn(bl))
    # 마치며
    if letter.get("closing"):
        closing = "".join(_p(t, size=15, color="#222222", mt=(12 if i else 0)) for i, t in enumerate(letter["closing"]))
        parts.append(_divider())
        parts.append(_row('%s%s' % (_section_header("마치며,"), closing)))
    # 푸터
    parts.append('<tr><td style="padding:8px;">&nbsp;</td></tr>')
    parts.append(letter.get("footer_html", DEFAULT_FOOTER))

    return (
        '<!DOCTYPE html>\n<html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;padding:0;background-color:%s;">'
        '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" '
        'style="background-color:%s;font-family:%s;">'
        '<tr><td align="center" style="padding:16px 8px;">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" '
        'style="width:600px;max-width:600px;background-color:#ffffff;">%s'
        '</table></td></tr></table></body></html>'
        % (PAGE_BG, PAGE_BG, FONT, "".join(parts))
    )


if __name__ == "__main__":
    # 최소 예시(연결 확인용). 실제로는 SKILL이 letter dict를 채워 import 해 쓴다.
    demo = {
        "header": {"period": "데모 호", "tagline": "빌더 연결 확인"},
        "intro": ["안녕하세요, TikCle 팀이에요 :)", "이건 빌더 <b>연결 확인용</b> 데모예요."],
        "blocks": [
            {"type": "section", "title": "📍 이번 달 시장 소식",
             "body": [{"p": "문단 하나."}, {"bullets": ["신호1", "신호2"]}]},
            {"type": "digging", "title": "🔍 이번 달 디깅 브랜드 — 예시",
             "intro": "박스 인트로.", "items": [{"h": "① 포인트", "p": "설명."}],
             "xy": [["통념", "진짜"]], "check": "👉 우리 브랜드 점검: …"},
            {"type": "readmore", "title": "📖 더 깊게 읽어보기", "post_title": "예시 글",
             "desc": "요약.", "cta_href": "https://www.4am.team/blog"},
            {"type": "news", "title": "📣 새소식", "items": ["소식1", "소식2"]},
        ],
        "closing": ["이번 달 핵심은 …", "TikCle 진단서 한 번 해보세요 ☕️"],
    }
    import tempfile, os
    out = build(demo)
    path = os.path.join(tempfile.gettempdir(), "_tikcle_demo_letter.html")
    open(path, "w", encoding="utf-8").write(out)
    print("wrote %s (%d bytes)" % (path, len(out)))
