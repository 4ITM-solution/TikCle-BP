"use client";

import React from "react";

/**
 * 섹션 단위 Error Boundary — 한 섹션이 render 중 throw 해도 페이지 전체가
 * "Application error"로 blank 되지 않게 격리. fallback 에 에러 메시지를 그대로
 * 노출해 어느 섹션의 어떤 값이 문제인지 바로 진단 가능.
 */
export class SectionBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { name: string; children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // 콘솔에도 섹션명과 함께 남김
    console.error(`[SectionBoundary:${this.props.name}]`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            margin: "12px 0",
            padding: "12px 14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          ⚠ <b>{this.props.name}</b> 섹션 로드 실패 — 다른 섹션은 정상입니다.
          <div
            style={{
              marginTop: 6,
              fontFamily: "monospace",
              fontSize: 11,
              color: "#7f1d1d",
              wordBreak: "break-all",
            }}
          >
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
