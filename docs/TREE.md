# 문서 트리 (Documentation Tree)

> 자판기 시뮬레이터(Vending Machine Simulator) 프로젝트의 전체 Spec 문서 네비게이션입니다.
> 새 문서를 추가하면 이 트리에도 반드시 반영하세요.

## 계층 구조

```
sdd_hackerton_minji/                # 프로젝트 루트
├── docs/                           # 스펙 문서 (SSoT)
│   ├── TREE.md                     # (현재 문서) 문서 트리 / 네비게이션
│   ├── spec.md                     # 프로젝트 헌법: 불변원칙·도메인규칙 + 스택·LLM규정·TDD·구현/검증 플로우·이탈보정 하네스
│   ├── business/                   # 비즈니스 로직 Spec (구현 독립적, "무엇을/왜")
│   │   ├── sales-mode.md           # 판매 모드 (Sales Mode) — 투입·선택·배출·잔돈·자동반환
│   │   └── admin-mode.md           # 관리자 모드 (Administrator Mode) — 재고·잔돈·매출·로그
│   ├── ui/                         # UI 디자인 & 리소스 규격
│   │   ├── design-system.md        # 디자인 시스템(색·타이포·컴포넌트·상태·리소스)
│   │   └── screen-layouts.md       # 화면 레이아웃 & 전환 (판매: device 오버레이·드래그 투입·배출 애니메이션)
│   └── requirements/               # 화면별 요구사항 + 각 모드별 테스트 케이스
│       ├── sales-screen.md         # 판매 화면 요구사항 + 테스트 케이스(TC-A*)
│       └── admin-screen.md         # 관리자 화면 요구사항 + 테스트 케이스(TC-B*)
├── resources/                      # 구현 리소스 (이미지)
│   ├── device.png                  # 자판기 본체 (판매 화면 중앙 배경, 세로형)
│   ├── 100.png · 500.png           # 드래그 화폐
│   └── 1000.jpeg                   # 드래그 화폐 (주의: jpeg 확장자)
├── index.ts                        # 구현 진입점
└── package.json
```

## 문서별 요약

| 문서 | 계층 | 목적 | 핵심 독자 |
|------|------|------|-----------|
| [spec.md](spec.md) | 최상위 | 불변원칙·도메인규칙·용어(§1~7) + 기술스택·LLM규정·TDD·구현/검증 플로우·이탈보정 하네스(§8~12) | 전원 (구현 에이전트는 §11부터) |
| [business/sales-mode.md](business/sales-mode.md) | 비즈니스 | 판매 모드 로직(투입·선택·배출·반환) | 백엔드/QA |
| [business/admin-mode.md](business/admin-mode.md) | 비즈니스 | 관리자 모드 로직(재고·잔돈·매출·로그) | 백엔드/QA |
| [ui/design-system.md](ui/design-system.md) | UI | 색/타이포/컴포넌트/상태 규격 | 프론트/디자인 |
| [ui/screen-layouts.md](ui/screen-layouts.md) | UI | 화면 레이아웃 & 전환 흐름 | 프론트/디자인 |
| [requirements/sales-screen.md](requirements/sales-screen.md) | 요구사항 | 판매 화면 요구사항 + 테스트 케이스 | 프론트/QA |
| [requirements/admin-screen.md](requirements/admin-screen.md) | 요구사항 | 관리자 화면 요구사항 + 테스트 케이스 | 프론트/QA |

## 읽는 순서 (권장)

1. **spec.md** — 프로젝트가 지켜야 할 대원칙과 용어를 먼저 이해합니다.
2. **business/** — 구현과 무관한 순수 도메인 규칙을 파악합니다.
3. **ui/** — 화면이 어떻게 생기고 어떻게 전환되는지 봅니다.
4. **requirements/** — 화면 단위로 무엇을 만들고, 어떻게 검증하는지 확인합니다.

## 참조 관계

- `requirements/*` 는 `business/*` 의 규칙을 화면 단위로 구체화합니다.
- `requirements/*` 는 `ui/*` 의 컴포넌트/레이아웃을 참조합니다.
- `ui/*` 는 `resources/` 의 이미지 자산(device·화폐)을 참조합니다.
- 모든 문서는 `spec.md` 의 용어·원칙을 따릅니다.
- 원 요구사항(출처): 구글 문서 "자판기 시뮬레이터 구현 요구사항".
