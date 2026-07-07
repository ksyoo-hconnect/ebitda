# 루프 적용 EBITDA 개선 추정모델 — 팀 설명서 (v3.8)

이 문서는 코드와 함께 버전관리되는 정식 설명서입니다. 모델 수정 시 README도 함께 갱신하십시오. 버전 번호는 파일명·kicker·헤더·footer 4곳을 일치시킬 것.

## 0. 이 문서의 사용법

처음 보는 팀원: §1~2(30초·철학)만 읽어도 무엇인지 안다.  
숫자를 만지는 사람: §5~9. 코드를 고치는 사람: §10~12.  
§3(가드레일)은 전원 필독 — 여기를 어기면 모델이 조용히 틀린다.

## 1. 30초 요약

인수 대상 병원 수치를 넣으면, 인바이츠루프 도입 시 연간 EBITDA 개선폭과 5개년 확산 효과를 추정한다. 8개 레버 ON/OFF(단계적 도입·미실행 반영), 레버 기여·순ΔEBITDA·회수기간·NPV가 실시간. 핵심 명제: "레버가 만든 돈 ≠ 병원이 가져가는 돈."

지불구조에 따라 만든 돈이 CMS로 새므로, "얼마 만들었나"와 "얼마 회수하나"를 반드시 분리한다.

## 2. 두 축의 철학

축1 — 무엇이 돈을 만드나 → 3개 레이어(B1/B2/B3)  
축2 — 누가 그 돈을 회수하나 → 게이트(Capture)

한 줄:

```text
Y1 ΔEBITDA = B1(payer mix 게이팅) + B2(payer-eligible)×(1+λ×κ) + B3(TM/MA only) − opex
5Y Dynamic = Y1 엔진을 연도별 입력으로 재계산 + B0(volume expansion/recapture)
```

capex는 EBITDA 밖, 회수기간·NPV에만 반영한다. v3.8의 B4 RHTP는 병원 EBITDA가 아니라 capex offset 또는 별도 operating support로 분리 표시한다.

## 3. 가드레일 — 전원 필독

1. 게이트는 한 곳에. "누가 회수하나"는 전부 Capture에서. `m`·`mk`·`θ`·payer mix를 여러 군데 흩뿌리면 같은 달러를 두 번 깎거나 더한다.
2. `λ`는 B2(원가)에만. 원가 레버 간 상호작용(초가법성)만. 매출·가치층 금지.
3. `θ`는 B3의 TM shared savings에만. DRG 고정 원가(LOS)는 100% 회수라 `θ` 불필요.
4. 케어 인건비는 한 번만. 원격케어 margin에 이미 반영 → opex 환자당은 플랫폼 몫만.
5. 경로 청구 이중계상 두 곳: M1(입원 Part B) ↔ RCM(Part A DRG)은 별개 stream. W(AWV) → M3(APCM)은 순차지 중복 아님.

새 레버 추가 시 반드시 이 다섯에 비춰 검토.

## 4. 3개 레이어

| 레이어 | 의미 | 예시 | 게이트 | 확실성 |
| --- | --- | --- | --- | --- |
| B1 직접수익 | 청구 현금 | 원격케어(경로)·RCM·Self-Pay전환 | TM/MA/Medicaid payer 게이팅 | 높음 |
| B2 운영효율 | 원가·throughput | Self-Pay원가·LOS·HRR·Agency | TM+Medicaid LOS / TM HRR ×(1+λ×κ) | 중간 |
| B3 가치기반 | 시스템 절감 | VBC(TM shared / MA HCC) | TM θ·regime / MA maVbc | 지불구조 종속 |

## 4.1 Payer mix — v3.7 핵심

v3.6까지는 `tmPct` 하나만 받고 `MA = 1 − TM`으로 계산해 사실상 Medicare(TM+MA) 100% 병원을 가정했다. v3.7부터는 현실 병원 payer mix를 명시 분리한다.

기본값:

- Medicare TM: 35%
- Medicare MA: 10%
- Medicaid: 25%
- Commercial: 30% (자동 = 100 − TM − MA − Medicaid)

계산 규칙:

| Payer | 원격케어 | LOS | HRRP | VBC / savEp | HCC·품질 |
| --- | --- | --- | --- | --- | --- |
| Medicare TM | ×1.00 | 반영 | 반영 | 반영 | 제외 |
| Medicare MA | ×`m` | 제외 | 제외 | 제외 | 반영 |
| Medicaid | ×`mk` = 0.10 | 반영 | 제외 | 제외 | 제외 |
| Commercial | 계산 0 | 계산 0 | 계산 0 | 계산 0 | 계산 0 |

Commercial은 현재 입력·검증용으로만 둔다. 민간보험 계약별 RPM/TCM/quality upside는 편차가 커서 기본 모델에서는 0으로 두어 Medicare 100% 착시를 제거한다. TM+MA+Medicaid 입력 합이 100%를 넘으면 앱 내부에서 세 값을 100%로 비례 축소하고 Commercial은 0%로 처리한다.

## 4.2 5개년 동적 모델 — v3.8 핵심

v3.8은 v3.7.1의 정적 Y1 EBITDA 엔진을 유지하되, 병원 확산에 따라 입력값이 매년 변하는 5개년 뷰를 추가한다. 핵심은 "같은 레버라도 볼륨이 늘면 W·M1·M2, LOS, VBC 모수가 함께 커진다"는 점이다.

추가 레이어:

| 레이어 | 의미 | 계산 위치 | EBITDA 처리 |
| --- | --- | --- | --- |
| B0 Volume Expansion / Recapture | 점유율 상승, 외래 panel 확장, specialty→admission 전환으로 생기는 추가 입원 margin | 5개년 동적 계산 | `dynamicNet = staticNet + B0` |
| B4 RHTP Government Capture | RHTP 등 보조금·지원금 성격의 capex offset / recurring support | 5개년 보조 표시 | EBITDA와 분리 표시 |

기본 ramp:

```text
volumeRamp = [0, .35, .65, .90, 1.00]
rhtpRamp   = [.50, 1.00, 1.00, 1.00, 1.00]
```

Y1은 기존 정적 모델과 비교 가능하도록 B0를 0으로 둔다. Y2부터 점유율·panel 확산이 반영된다.

주요 동적 산식:

```text
growthLocal = localGrowthMax × volumeRamp
panelExpansion = (targetPanel − baselinePanel) × volumeRamp
growthPanel = panelExpansion / baselinePanel × admissionConv
totalGrowth = growthLocal + growthPanel

yearDischarges = baselineDischarges × (1 + totalGrowth)
yearPartA      = baselinePartA × (1 + totalGrowth)
yearPanel      = baselinePanel × (1 + growthLocal × panelElasticity) + panelExpansion
yearOcc        = baselineOcc + (occTarget − baselineOcc) × volumeRamp

B0 = (baselineDischarges × growthLocal × cmCase × alpha)
   + (baselineDischarges × growthPanel × cmCase × alpha)
```

주의: HRRP와 PEPPER/RCM의 리스크 기준액은 확산 후 볼륨이 아니라 baseline volume을 기준으로 본다. 볼륨이 커졌다는 이유로 과거 coding/penalty 개선분까지 같이 부풀리지 않기 위해서다.

## 5. B1 경로 청구 엔진 (v3.3 핵심)

원격케어는 단일 PMPM이 아니라 환자 경로 전 구간 청구. 모수가 둘로 갈림:

```text
W  예방·관문  = panel × AWV포착률 × $150 × margin      (flow; APCM 개시 관문)
M1 입원 PartB = 퇴원수 × $400 × 포착률 × margin         (flow; RCM=Part A와 별개)
M2 퇴원후 TCM = 퇴원수 × TCM적격률 × $230 × margin       (flow; 99495/96, 30일 1회)
M3 종단       = 등록panel(panel×π) × netPMPM × 12       (stock; APCM·RPM 코호트 스택)
```

W·M1·M2는 퇴원수(flow), M3만 등록 panel(stock)에 연동 → 볼륨·throughput 늘면 B1 증가.

합계에 payer 스플릿(TM×1 / MA×m / Medicaid×mk / Commercial×0) + ACO 음결합 차감.

M3 코호트 스택: 만성(APCM L2+RPM)·QMB복합(L3+RPM+BHI)·행동건강(+CoCM)·경증(L1). 가중 gross 약 $181/월 × margin × adherence. 배타규칙(APCM↔CCM·PCM·TCM)이라 18코드 합 아님.

## 5.1 RCM 실현율 갭 — v3.8

v3.7.1까지 RCM은 `Part A × rcmRate × PEPPER cap`에 가까운 단순 uplift였다. v3.8부터는 gross charge와 현재 실현율을 입력할 수 있으면 실현율 갭 방식으로 계산한다.

```text
rcmGap  = max(0, targetRealization − currentRealization)
rcmBase = grossCharges × rcmGap × α_rcm × pepperCap
RCM     = rcmBase
```

`grossCharges`가 0이면 데이터가 없다는 뜻으로 보고 기존 fallback을 사용한다.

```text
fallback rcmBase = baseline Part A × rcmRate × pepperCap
```

`pepperCap`은 PEPPER percentile이 80을 넘으면 0.5로 낮춘다. coding outlier가 높을 때 RCM upside를 그대로 인정하면 diligence에서 과대평가될 수 있기 때문이다.

## 6. B2 원가 — LOS haircut

```text
ΔLOS × 1일당변동비 × (퇴원수 × (TM+Medicaid) × 대상비중) × realizable haircut + throughput
```

대상비중: pathway 최적화 가능 퇴원 서브셋(전체 아님). v3.7에서는 LOS 절감 대상 payer를 TM+Medicaid로 제한한다.  
realizable haircut: 진짜 원가에서 빠지는 몫만(0.4일 단축이 곧 FTE절감 아님 — step-fixed 착시).  
throughput: 빈 병상→신규환자, 점유율 게이팅(55%↓ 거의 0, 85%+ 완전 실현).

## 7. B3 VBC — CMS AHCAH 실측 앵커

```text
TM shared savings = 퇴원수 × %TM × ACO귀속 × CMS 절감/에피소드 × selBias × θ × regime배수
MA HCC·품질       = MA lives × HCC값 × maVbc × selBias
Medicaid/Commercial VBC = 0
```

CMS AHCAH 30일 절감 밴드:

- 보수: $1,088(top-10 볼륨가중에 선택편의 보수 반영)
- 기본: $1,209(볼륨가중 raw)
- 공격: $1,640(CMS Overall, 25 DRG)

`selBias` 기본 0.90은 HCC gap(2.04/2.26≈0.90)을 이용한 순귀속 근사다. v3.6부터는 TM shared savings뿐 아니라 MA HCC·품질 업사이드에도 적용한다. 자발적 건강관리 의지나 기관 선택편의로 인한 업사이드 착시를 낮추는 보수적 밴드 조정계수이며, 정식 위험보정 point estimate는 아니다.

v3.7에서 Medicaid와 Commercial은 B3에서 제외한다. Medicaid shared savings와 Commercial quality upside는 주별/계약별 편차가 커서 기본 스크리너에서는 0으로 둔다.

IC 방어: B3는 payer 절감 풀이지 병원 EBITDA가 아니다. 반드시 `θ·regime`을 통과해야 한다.  
IC 방어: LOS 레버를 AHCAH 데이터로 정당화하지 말 것. AHCAH LOS는 오히려 +0.79일.

## 8. λ·θ·regime — 오해 방지

`λ`(원가 시너지): 원가 레버 함께 켜면 각자 합보다 더 나오는 부분. 2개↑ ON에서만 작동한다.

`κ`(케어 밀도): 원격케어가 켜졌을 때 LOS 단축과 HRR 재입원 절감의 교차 시너지를 조절한다. 기존 선형 스케일(`min(π/0.50, 1)`) 대신 `π=30%`를 inflection으로 둔 S-curve를 사용한다. 등록전환율이 낮을 때는 시너지를 거의 인정하지 않고, 30%를 넘어서면서 케어 매니지먼트 밀도가 빠르게 올라가며, 50% 근방에서 1에 수렴한다.

```text
λ·κ 커플링 = (LOS 절감 + HRR 절감) × λ × cost조합스케일 × κ
```

대표 κ 값:

- 보수 `π=15%` → `κ≈0.026`
- 기본 `π=30%` → `κ≈0.504`
- 공격 `π=50%` → `κ=1.000`

파일럿 실측으로 증명해야 하며, point estimate가 아니라 밴드다.

`θ×regime`: LOS 절감은 즉시 회수(DRG), post-acute·총비용 절감은 에피소드 책임구조에서만.

- 순수 FFS ×0.10(사망)
- TEAM ×0.85
- ACO ×1.0

APCM↔VBC 게이트: 원격케어(APCM) 켜면 순수 FFS라도 `θ` 0.5 floor. APCM 청구가 ACO/REACH/MCP 참여를 요구하기 때문.

## 9. 파라미터 (3-tier) — 코드 `SCEN`

| 항목 | 보수 | 기본 | 공격 |
| --- | ---: | ---: | ---: |
| pi(등록전환) | .15 | .30 | .50 |
| margin(자동화순마진) | .45 | .60 | .72 |
| adher | .60 | .75 | .90 |
| m(MA 원격 회수율) | .20 | .45 | .70 |
| mk(Medicaid 원격 회수율) | .10 | .10 | .10 |
| awvRate/m1Rate/tcmRate(경로포착) | .25/.30/.20 | .45/.50/.40 | .65/.70/.60 |
| dLOS/losReal | .2/.40 | .4/.60 | .7/.85 |
| savEp | 1088 | 1209 | 1640 |
| theta/lambda | .10/.10 | .35/.25 | .60/.45 |
| kappa(S-curve, derived from pi) | ≈.026 | ≈.504 | 1.000 |
| hccVal/maVbc | 200/.30 | 500/.55 | 1000/.75 |
| cmCase | 2000 | 4000 | 7000 |
| rcmTarget(목표 실현율) | 21% | 22% | 24% |

Baseline payer mix:

| 항목 | 기본값 |
| --- | ---: |
| Medicare TM | 35% |
| Medicare MA | 10% |
| Medicaid | 25% |
| Commercial | 30% 자동 |

v3.8 동적 입력:

| 항목 | 기본값 | 의미 |
| --- | ---: | --- |
| grossCharges | 0 | RCM 실현율 갭 계산용 gross charge run-rate. 0이면 Part A fallback |
| currentRealization | 19% | 현재 청구 실현율 |
| rcmAlpha | .30 | RCM 개선분 중 Loop/프로그램 귀속률 |
| occTarget | 75% | 5년 목표 점유율 |
| alpha | .35 | B0 volume expansion 중 Loop 귀속률 |
| panelTarget | 50,000 | 5년 목표 활성 panel |
| panelElasticity | 1.3× | 점유율 상승이 panel에 미치는 탄성 |
| admissionConv | 5% | specialty/primary care 확장이 입원으로 전환되는 비율 |
| rhtpOffset | $2M | capex에서 차감되는 정부지원/보조금 |
| rhtpRecurring | $0.5M/yr | 반복 운영지원. EBITDA와 분리 표시 |

## 10. 코드 지도

- `SCEN` — 3-tier 파라미터. 숫자 튜닝은 여기.
- `REGIME` — 책임구조 4종·θ배수. 지불모델 추가는 여기.
- `COHORTS` + `AWV_VAL`·`M1_VAL`·`TCM_VAL` — 경로 청구 단위값. 스택·단가 수정 여기.
- `payerMix()` — TM/MA/Medicaid/Commercial 비중 계산. Commercial 자동 산출 및 100% 초과 입력 비례 축소.
- `COST_KEYS` — λ 걸리는 원가 레버. B2 추가 시 등록.
- `LEVERS` — 8개 레버 표시정보.
- `FORMULA_DEFAULTS` — 수동 편집 가능한 기본 계산식. B1/B2/B3뿐 아니라 v3.8의 RCM gap, B0, B4, 5개년 NPV 산식도 포함한다.
- `FORMULA_META` — 계산식 편집 패널의 표시 순서·그룹·라벨.
- `compute()` — Y1 핵심 엔진. B1(경로 payer mix)→B2(TM+Medicaid LOS / TM HRR→λ×κ→throughput)→B3(TM shared / MA HCC)→net→payback. 반환 `parts`에 레버·경로·payer별 값.
- `computeDynamic()` — v3.8 5개년 엔진. baseline 입력에서 연도별 퇴원수·Part A·panel·점유율·gross charge를 재계산하고 B0/B4/NPV/payback year를 산출한다.
- `App()` — 화면·토글·waterfall·경로카드·경고·입력·5개년 카드·계산식 편집 패널.
- `styles` — 디자인 토큰.

### 10.1 계산식 수동 편집 — v3.7.1/v3.8

앱의 "계산식 수동 편집" 패널에서 `FORMULA_DEFAULTS`에 등록된 산식을 직접 바꿀 수 있다. 허용 문법은 숫자, 변수명, 사칙연산, 괄호, `min/max/abs/round/floor/ceil/pow`다. 비교 연산자, 삼항식, 문자열, 객체 접근은 금지한다. 오류가 나면 해당 항목은 기본식으로 fallback한다.

v3.8에서 추가로 편집 가능한 내부 산식:

| 그룹 | 키 |
| --- | --- |
| RCM | `rcmGap`, `rcmBase` |
| 동적 램프 | `volumeRamp`, `rhtpRamp` |
| 동적 연도 | `growthLocal`, `panelExpansion`, `growthPanel`, `totalGrowth`, `yearDischarges`, `yearPartA`, `yearPanel`, `yearOcc`, `yearGrossCharges` |
| B0 | `b0Local`, `b0Panel`, `b0Active`, `b0` |
| B4/RHTP | `b4` |
| 5개년 최종 | `dynamicNet`, `netInvestment`, `npvInitial`, `npvTerm`, `totalEconomicImpact` |

수식 추가 원칙: 내부적으로 산식을 새로 만들면 `FORMULA_DEFAULTS`에 기본식을 넣고, `FORMULA_META`에 표시 항목을 추가하고, 실제 계산도 `safeEvalFormula()`를 거치게 한다. 화면에서 못 바꾸는 하드코딩 산식은 diligence용 모델에서 추적이 어렵다.

## 11. 업그레이드 가이드

새 레버 추가:

1. 어느 레이어인지 결정(게이트·λ·θ 여부가 갈림).
2. `LEVERS`에 추가 → `compute()`에 공식, `parts`에 추가.
3. B2면 `COST_KEYS` 등록. B3면 `θ·regime` 또는 `maVbc` 곱.
4. waterfall items·레버카드 val·초기 lv state에 추가.
5. 내부 산식이 새로 생기면 `FORMULA_DEFAULTS`와 `FORMULA_META`에 등록하고, 계산은 `safeEvalFormula()`를 거치게 한다.
6. 5개년 확산에 영향을 주면 `computeDynamic()`의 연도별 입력 재계산과 B0/B4 카드도 함께 확인한다.

튜닝만: `SCEN` 숫자만. 근거(공개데이터/실측) 출처를 주석으로.

커밋 전 체크리스트:

- [ ] 순수 FFS에서 B3(TM) 거의 죽고, telecare 켜면 θ 0.5 floor 뜨나?
- [ ] cost 레버 1개만 켜면 λ=0인가?
- [ ] telecare OFF 또는 π 낮은 시나리오에서 κ가 LOS/HRR 시너지를 보수적으로 낮추는가?
- [ ] selBias를 낮추면 TM shared savings와 MA HCC·품질 업사이드가 함께 줄어드는가?
- [ ] 기본 payer mix가 TM 35% / MA 10% / Medicaid 25% / Commercial 30%인가?
- [ ] Commercial을 올리면 계산값이 줄고, Commercial 자체는 계산 0으로 남는가?
- [ ] Medicaid는 원격케어×0.10과 LOS에만 반영되고 B3에는 들어가지 않는가?
- [ ] TM+MA+Medicaid 합이 100% 초과일 때 비례 축소 경고가 뜨는가?
- [ ] 점유율 50%↓에서 throughput=0인가?
- [ ] PEPPER>80에서 RCM 반토막·경고 뜨나?
- [ ] grossCharges가 있으면 RCM이 `grossCharges × rcmGap × α_rcm`, 없으면 Part A fallback으로 계산되나?
- [ ] 퇴원수 올리면 W·M1·M2(flow) 함께 커지나?
- [ ] v3.8에서 Y1 B0=0이고 Y2~Y5부터 volume ramp가 적용되나?
- [ ] 목표 점유율·panel target을 올리면 5개년 Y5 run-rate와 cumulative가 증가하나?
- [ ] RHTP offset은 net investment를 낮추고, recurring support는 EBITDA와 별도 표시되나?
- [ ] 새로 추가한 내부 수식이 계산식 수동 편집 패널에 나타나고 실제 계산에 반영되나?
- [ ] capex가 net에서 안 빠지고 회수기간만 반영되나?

## 12. 알려진 한계 & 다음 버전

- 파라미터 절반이 [DR]/[ASS] 추정 → 이 도구는 point estimate가 아니라 밴드·구조 스크리너. data-room 열리면 실청구·실LOS·실점유로 교체.
- λ·κ는 근사(단일모듈도 완전히 깨끗하진 않음) → 신뢰구간으로.
- regime 단일 선택 → 실제는 TM-ACO·MA blend. 다음 후보: TM 볼륨의 ACO/TEAM 편입률 분리.
- Commercial은 계산 0으로 둔 보수적 placeholder다. 민간보험 계약서에서 care management fee, RPM/TCM reimbursement, quality bonus가 확인되면 별도 회수율로 추가.
- Medicaid는 원격 `mk=0.10`과 LOS만 반영한다. 주별 Medicaid managed care 계약·waiver·quality pool 확인 후 별도 조정 필요.
- v3.8의 B0 volume expansion은 attribution 추정이다. 점유율 상승이 Loop 때문인지, 시장 성장·의사 채용·계약 변화 때문인지 분리할 data-room 근거가 필요하다.
- RHTP는 EBITDA 개선이 아니라 financing/지원금 성격으로 분리해야 한다. 투자회수·현금흐름 설명에는 유용하지만 valuation multiple에 그대로 얹으면 안 된다.
- 계산식 편집 패널은 arithmetic sandbox다. 조건문·비교식이 필요한 경우에는 0/1 flag 변수를 코드에서 먼저 만들고 수식에는 산술식만 노출한다.
- 경로 청구 적격률(AWV 연1회·TCM 30일 1회·배타규칙)이 이론최대와 실현치의 갭 → 실데이터 검증.

## 13. PEPPER & 성과 데이터 소스

PEPPER는 CMS가 정한 target area별 provider-specific Medicare 통계 Excel 리포트다. 공개 bulk 데이터라기보다 병원별 권한이 필요한 포털 리포트이며, billing·DRG coding·admission necessity·short-stay outlier·LOS 증가 등 RCM/컴플라이언스 감시에 적합하다.

요청 항목별 현실적인 소스:

| 항목 | 1차 소스 | 모델 사용 |
| --- | --- | --- |
| RCM / CMI vs billing CMI / coding outlier | PEPPER Portal | `pepper` 입력, RCM cap |
| 30일 재입원 / HRRP | CMS HRRP, CMS hospital datasets | HRR·`dPen`·TM readmission risk |
| Mortality | CMS Provider Data Catalog hospital outcomes | clinical risk screen |
| Safety / HAC / 감염 | CMS hospital datasets, HAC measures | diligence risk screen |
| ED 재방문 | AHRQ HCUP NEDS/SEDD | avoidable ED revisit screen |
| Cost by diagnosis | CMS inpatient PUF, HCUP | `varCostDay`, `cmCase`, DRG tuning |
| Volume by diagnosis | CMS inpatient PUF, HCUP | `discharges`, target DRG mix |

공식 링크:

- PEPPER Resources: https://pepper.cbrpepper.org/
- CMS Hospital Readmissions Reduction Program: https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps/hospital-readmissions-reduction-program-hrrp
- CMS Provider Data Catalog — Hospitals: https://data.cms.gov/provider-data/topics/hospitals
- AHRQ HCUP NEDS: https://hcup-us.ahrq.gov/nedsoverview.jsp

## 14. 용어집

이 용어집은 v3.8 화면에서 보이는 약어·입력값·계산 변수까지 설명하기 위한 것이다. 화면에서 같은 단어가 영어/한글로 섞여 보이면 같은 행을 기준으로 해석한다.

### 14.1 화면 상단·결과 KPI

| 용어 | 의미 |
| --- | --- |
| 루프 / Loop | 인바이츠루프 적용 프로그램 또는 플랫폼을 뜻한다. |
| EBITDA | 감가상각·이자·세금 차감 전 영업이익. 이 모델의 핵심 결과값은 EBITDA 개선폭이다. |
| 순 ΔEBITDA | 기존 대비 늘어나는 EBITDA. `gross 개선액 − Loop 운용비`로 본다. |
| 순 ΔEBITDA / 년 | 연간 기준 순 EBITDA 개선액. 화면의 첫 번째 큰 숫자다. |
| 5개년 누적 순ΔEBITDA | Y1~Y5까지 연도별 순 ΔEBITDA를 합산한 값. |
| Y1~Y5 | 1년차~5년차. v3.8 동적 모델은 5개년으로 계산한다. |
| Y5 run-rate | 5년차에 도달했을 때의 연간 순 ΔEBITDA 수준. 일회성 누적값이 아니라 5년차 연간 체력이다. |
| 회수 / payback | 투자비를 순 ΔEBITDA로 회수하는 데 걸리는 기간. 정적 화면은 연수, 5개년 화면은 `Y2`, `Y3`처럼 회수 연도를 표시한다. |
| NPV@10% | 10% 할인율로 계산한 5개년 순현재가치. 미래 현금흐름을 현재가치로 낮춘 값이다. |
| Gross CAPEX | RHTP 등 보조금 차감 전 총 구축비. |
| Net investment | RHTP offset 등을 차감한 실제 부담 투자액. |
| 구축비 / capex | 시스템 구축에 드는 1회성 투자비. EBITDA에서는 빼지 않고 회수기간·NPV에만 사용한다. |
| 운용비 / opex | 매년 들어가는 운영비. 순 ΔEBITDA 계산에서 차감한다. |
| Gross 개선액 / gross | B1+B2+B3 등 레버가 만든 총 개선액. opex 차감 전 값이다. |
| Net / net | opex 차감 후 순 개선액. 화면의 순 ΔEBITDA와 같은 방향의 값이다. |
| capacity | 병상 기준 처리 가능량 대비 현재 퇴원수 사용률. 너무 높으면 추가 환자 수용 여력이 제한된다. |
| 보수 / 기본 / 공격 | 3개 시나리오. 보수는 낮은 실현, 기본은 중간, 공격은 높은 실현 가정이다. |
| 보수~공격 band | 보수 시나리오부터 공격 시나리오까지 결과 범위. point estimate가 아니라 범위로 보라는 뜻이다. |
| USD / KRW | 금액 표시 통화. USD는 달러, KRW는 원화 환산 표시다. |
| `$M` / `$M/yr` / `$/yr` | 백만 달러, 연간 백만 달러, 연간 달러 단위. |

### 14.2 Payer·책임구조

| 용어 | 의미 |
| --- | --- |
| payer | 병원비를 실제로 지불하거나 비용 절감 이익을 가져가는 주체. Medicare, Medicaid, Commercial, Self-Pay 등이 있다. |
| payer mix | 환자/수익이 payer별로 섞인 비율. v3.7부터 TM/MA/Medicaid/Commercial을 명시 분리한다. |
| Medicare | 미국 연방 노인·장애인 의료보험. 이 모델에서는 TM과 MA로 나눈다. |
| TM / Medicare TM | Traditional Medicare. 연방정부가 진료비를 직접 지불하는 Medicare FFS 영역. APCM, HRRP, VBC shared savings 계산의 핵심 payer다. |
| MA / Medicare MA | Medicare Advantage. 민간 보험사가 Medicare를 대신 운영하는 영역. 원격케어는 `m`만큼, 가치는 HCC·품질 업사이드만 반영한다. |
| Medicaid | 저소득층 중심 공공보험. v3.8 기본 모델에서는 원격케어 `mk=0.10`과 LOS만 반영하고 VBC는 0으로 둔다. |
| Commercial | 민간보험. 현재 모델에서는 입력·검증용으로만 두고 계산값은 0으로 둔다. Medicare 100% 착시를 제거하기 위한 보수적 처리다. |
| Self-Pay | 보험 회수가 불확실하거나 본인부담 위험이 큰 환자/매출 영역. 전환 또는 원가회피 레버에 사용한다. |
| Commercial (자동) | `100 − TM − MA − Medicaid`로 자동 계산되는 민간보험 비중. |
| TM/MA/Medicaid 비례 축소 | 세 입력 합계가 100%를 넘으면 내부 계산에서 세 값을 100%로 비례 축소하고 Commercial은 0으로 둔다. |
| m | MA 원격케어 회수율. MA에서는 TM처럼 100% 회수되지 않는다고 보고 `teleGross × MA × m`으로 낮춘다. |
| mk | Medicaid 원격케어 회수율. 기본값 0.10으로 매우 낮게 둔다. |
| maVbc | MA HCC·품질 업사이드 중 병원이 회수한다고 보는 비율. |
| regime / 에피소드 책임구조 | 병원이 총진료비 절감분을 얼마나 회수할 수 있는지 결정하는 지불 구조. |
| 순수 FFS | Fee-for-Service만 있는 상태. 진료마다 돈을 받지만 총비용 절감분은 대부분 payer에게 새므로 B3 회수율이 낮다. |
| ACO | Accountable Care Organization. 총비용을 줄이면 shared savings를 받을 수 있는 책임진료 구조. |
| TEAM 의무 | CMS의 에피소드 기반 번들/책임지불 구조. 특정 입원 에피소드의 비용과 품질을 책임진다. |
| MA 위험분담 | Medicare Advantage에서 보험사·병원 등이 위험과 보상을 나누는 구조. |
| capitation | 환자 1인당 정액으로 지불받는 방식. 진료량보다 총관리 성과가 중요하다. |
| θ / theta | TM shared savings 중 병원이 실제로 회수하는 비율. |
| θ×regime | 기본 θ에 지불구조별 배수를 적용한 실제 B3 회수 게이트. |
| TM value 게이팅 | TM에서 생긴 가치 절감액이 병원 EBITDA로 들어오기 전에 θ와 regime을 통과해야 한다는 뜻. |
| APCM 게이트 floor 0.5 | 원격케어/APCM이 켜지면 순수 FFS라도 VBC 참여 요건이 있다고 보고 θ 회수 배수를 최소 0.5로 올리는 장치. |

### 14.3 레이어·레버

| 용어 | 의미 |
| --- | --- |
| B0 | v3.8에서 추가된 볼륨 확장/recapture 레이어. 점유율 회복, panel 활성화, specialty→입원 전환으로 생기는 추가 margin을 뜻한다. |
| B1 | Direct Revenue. 청구 현금으로 바로 들어오는 직접수익 레이어. 원격케어, RCM, Self-Pay 전환이 포함된다. |
| B2 | Cost Efficiency. 원가 절감·throughput 개선 레이어. LOS, HRR, Agency Labor, Self-Pay 원가회피가 포함된다. |
| B3 | Value-Based. payer 총비용 절감 또는 MA HCC·품질 업사이드 레이어. 병원 EBITDA가 되려면 회수 게이트를 통과해야 한다. |
| B4 | RHTP 등 정부지원 capture. EBITDA와 분리해 capex offset 또는 별도 operating support로 표시한다. |
| Direct Revenue | 직접 청구 또는 현금 회수로 생기는 수익. |
| Cost Efficiency | 비용을 줄이거나 병상 회전율을 높여 만드는 개선액. |
| Value-Based | 가치기반 계약에서 총비용 절감·품질·위험조정으로 생기는 업사이드. |
| Volume Expansion | 병원 볼륨 증가로 생기는 추가 EBITDA. v3.8에서는 B0로 표시한다. |
| local recapture | 빠져나가던 환자/입원을 지역 병원 안으로 되찾아오는 효과. |
| panel activation | 외래 panel을 실제 관리·등록 환자로 활성화해 입원·관리 수요로 연결하는 효과. |
| steady-state layer | 5년차처럼 확산이 끝난 뒤 안정적으로 반복되는 레이어 값. |
| 레버 | EBITDA 개선을 만드는 실행 항목. ON/OFF로 켜고 끌 수 있다. |
| 원격케어 | AWV, TCM, APCM, RPM 등 원격·비대면 관리 청구와 관리 효과를 묶은 B1 레버. |
| RCM | Revenue Cycle Management. 청구·코딩·문서화 개선으로 회수율을 높이는 작업. |
| CDI | Clinical Documentation Improvement. 진료기록 문서화를 개선해 적정 코딩·청구를 가능하게 하는 활동. |
| RCM·실현율 갭 | 현재 실현율과 목표 실현율의 차이를 gross charges에 곱해 RCM upside를 추정하는 v3.8 방식. |
| Self-Pay 전환 | Self-Pay 위험 매출을 보험 적격성 확인·전환 등으로 회수 가능한 매출로 바꾸는 레버. |
| Self-Pay 원가회피 | Self-Pay 환자 관리 방식을 바꿔 대면·고비용 서비스를 줄이는 B2 원가 레버. |
| LOS 단축 | Length of Stay, 평균 재원일수를 줄이는 레버. |
| LOS 변동비 | LOS가 줄 때 병원이 실제로 줄일 수 있는 일당 변동비. |
| HRR 재입원 | Hospital Readmission Reduction 관련 재입원 페널티 또는 회피액. 화면에서는 TM에만 반영한다. |
| Agency Labor | 파견·임시 인력 비용. 줄이면 B2 비용절감으로 잡힌다. |
| VBC | Value-Based Care. 총비용 절감, 품질, 위험조정 성과에 따라 보상을 받는 모델. |
| HCC·품질 | MA에서 위험조정(HCC)과 품질 성과로 생기는 업사이드. |
| shared savings | payer의 총비용을 줄인 뒤 병원/조직이 일부를 나눠 받는 절감 공유액. |
| ACO 음결합 / clawback | 원격케어 청구가 ACO shared savings 풀을 일부 줄이는 것으로 보는 차감 항목. |

### 14.4 경로 청구 엔진

| 용어 | 의미 |
| --- | --- |
| 경로 청구 엔진 W→M1→M2→M3 | 환자가 예방·입원·퇴원후·장기관리로 이동하는 경로별 청구 가능액을 나눠 계산하는 엔진. |
| W | 예방·관문 단계. AWV·스크리닝 등으로 APCM 시작점이 되는 경로. |
| M1 | 입원 중/입원 관련 Part B 전문의료 포착. RCM의 Part A DRG/CMI와 별개 stream이다. |
| M2 | 퇴원후 TCM 단계. 퇴원 후 30일 관리 청구를 의미한다. |
| M3 | 종단 관리 단계. APCM·RPM 등 월 반복 관리 청구가 쌓이는 stock 영역. |
| AWV | Annual Wellness Visit. Medicare 연차 건강검진. |
| 스크리닝 | 환자 상태·위험을 확인하는 검사/평가 활동. |
| Part A | Medicare 입원·시설성 급여 영역. DRG 입원지불액과 연결된다. |
| Part B | Medicare 의사·전문의료·외래성 급여 영역. M1은 Part B 포착으로 본다. |
| DRG | Diagnosis-Related Group. 입원 건을 진단군으로 묶어 정액지불하는 방식. |
| CMI | Case Mix Index. 환자 중증도/자원소모를 반영한 지수. RCM·CDI와 관련이 크다. |
| TCM | Transitional Care Management. 퇴원 후 30일 전이케어. |
| 99495/96 | TCM 청구 코드. 퇴원 후 관리 복잡도에 따라 쓰이는 CPT 코드다. |
| APCM | Advanced Primary Care Management. 월 단위 일차진료 관리 청구. VBC 관문 역할을 한다. |
| RPM | Remote Patient Monitoring. 원격 생체정보 모니터링. |
| BHI | Behavioral Health Integration. 행동건강 통합관리. |
| CoCM | Collaborative Care Model. 정신건강/행동건강 협업관리 모델. |
| QMB | Qualified Medicare Beneficiary. Medicare 비용부담 지원 대상자. 모델에서는 복합 관리 코호트로 표시된다. |
| 만성 2+ | 두 개 이상 만성질환을 가진 고관리 필요 환자군. |
| L1/L2/L3 | APCM 관리 복잡도 단계. L1은 경증, L2/L3는 더 복잡한 관리군을 뜻한다. |
| flow | 해당 연도에 발생한 퇴원수·방문수 같은 흐름값. W·M1·M2는 flow 성격이다. |
| stock | 특정 시점에 등록되어 계속 관리되는 환자 수. M3는 등록 panel stock에 연동된다. |
| panel | 관리 가능한 외래 환자 모수. APCM 후보군의 기반이다. |
| 등록 panel / enrolled | `panel × π`로 계산되는 실제 관리 등록 환자 수. |
| PMPM | Per Member Per Month. 환자 1명당 월 금액. |
| net PMPM | gross 청구 가능액에서 margin·adherence 등을 반영한 월 순단가. |
| gross | 차감 전 총액. 문맥에 따라 gross 청구액 또는 gross 개선액을 뜻한다. |
| margin | 자동화·운영비 등을 제외하고 남는 순마진율. |
| adherence / adher | 환자가 프로그램에 실제로 참여·유지되는 비율. |
| 배타규칙 | 같은 기간에 동시에 청구할 수 없는 코드 조합을 제외하는 규칙. 예: APCM↔TCM 동월 배타. |

### 14.5 v3.8 동적 모델·볼륨 용어

| 용어 | 의미 |
| --- | --- |
| v3.8 dynamic | 정적 Y1 모델을 5개년으로 확장해 연도별 입력값을 재계산하는 동적 모델. |
| volumeRamp | Y1~Y5 확산 속도. 기본은 `[0, .35, .65, .90, 1.00]`이다. |
| rhtpRamp | RHTP recurring support가 연도별로 반영되는 속도. |
| growthLocal | 목표 점유율까지 회복되며 생기는 지역 볼륨 성장률. |
| panelExpansion | 목표 활성 panel까지 늘어나는 환자 모수. |
| growthPanel | 늘어난 panel이 입원/전문진료 볼륨으로 전환되는 성장률. |
| totalGrowth | `growthLocal + growthPanel`. 해당 연도의 총 볼륨 성장률. |
| baseline | 프로그램 적용 전 기준값. 동적 계산은 baseline 대비 변화를 계산한다. |
| baselineDischarges | 기준 연간 퇴원수. |
| baselinePanel | 기준 외래 panel. |
| targetPanel | 5년 목표 활성 panel. |
| staticNet | 해당 연도 입력으로 Y1 엔진을 다시 돌린 순 ΔEBITDA. B0 추가 전 값이다. |
| dynamicNet | `staticNet + B0`. 5개년 카드에 쓰는 연도별 순 ΔEBITDA. |
| B0 Local recapture | 점유율 상승으로 되찾아온 지역 입원 margin. |
| B0 Panel 활성화 | panel 확장이 입원/전문진료로 이어지며 생기는 margin. |
| B0 적용 여부 / b0Active | Y1에는 B0를 0으로 두고 Y2부터 적용하기 위한 0/1 스위치. |
| RHTP | Rural Hospital Transformation Program 등 병원 전환지원금 범주. 화면에서는 보조금/지원금 성격으로 분리한다. |
| RHTP offset | capex에서 차감되는 정부지원/보조금. |
| RHTP recurring | 매년 반복되는 운영지원금. EBITDA와 분리해 B4로 표시한다. |
| B4 recurring | 5년차 반복 운영지원금. |
| B4 5Y cumulative | Y1~Y5 B4 지원금 합계. |
| Total impact | Y5 순 ΔEBITDA와 Y5 B4 recurring을 합친 경제효과 표시. EBITDA 단독값은 아니다. |
| cumulative | 누적값. 보통 Y1~해당 연도까지의 합계를 뜻한다. |
| recapture | 외부로 빠지던 환자·수익·볼륨을 다시 병원 안으로 회수하는 효과. |
| run-rate | 특정 시점의 연간화된 반복 수준. |

### 14.6 병원 baseline 입력값

| 화면 입력 | 의미 |
| --- | --- |
| 전체 퇴원수/년 / discharges | 1년 동안 병원에서 퇴원한 입원 건수. W·M1·M2, LOS, VBC 계산의 모수다. |
| Medicare TM Part A 입원지불액 / partA | Medicare TM 입원 지불액. HRRP, RCM fallback 등에 쓰인다. |
| 1일당 변동비 / varCostDay | 입원 1일이 줄 때 절감 가능한 일당 변동비. |
| 평균 LOS / avgLOS | 평균 재원일수. throughput 계산에 사용한다. |
| 병상수 / beds | 가용 병상 수. capacity 계산에 사용한다. |
| 현 점유율 / occ | 현재 병상 점유율. LOS throughput gate와 B0 성장률에 영향을 준다. |
| LOS 대상 퇴원 비중 / losAddr | LOS 단축이 실제로 적용 가능한 퇴원 비중. 전체 퇴원수 전체가 아니다. |
| HRRP 페널티율 / hrrpRate | 재입원 페널티 위험을 나타내는 입력값. |
| ACO 귀속 TM / acoShare | TM 환자 중 ACO/shared savings 구조에 귀속되는 비중. |
| Self-Pay at-risk | 회수 위험이 있거나 보험 전환 가능성이 있는 Self-Pay 금액. |
| Agency labor | 파견·임시 인력 비용. |
| PEPPER percentile | PEPPER에서 coding/outlier 위험이 어느 분위에 있는지 나타내는 백분위. 80p 초과 시 RCM capture를 낮춘다. |
| Gross charges run-rate / grossCharges | 연간 gross charge 규모. v3.8 RCM 실현율 갭 계산에 사용한다. 0이면 Part A fallback. |
| 현 실현율 / currentRealization | gross charges 중 실제 수익으로 실현되는 현재 비율. |
| α_rcm RCM 귀속률 / rcmAlpha | RCM 개선분 중 Loop/프로그램 덕분이라고 볼 비율. |
| 목표 점유율 occT / occTarget | 5년차 목표 병상 점유율. |
| α Loop 귀속률 / alpha | B0 volume expansion 중 Loop 기여로 인정하는 비율. |
| 목표 활성 panel / panelTarget | 5년차 목표 관리/활성 외래 panel. |
| panel 탄성 / panelElasticity | 점유율 상승이 panel 확대에 얼마나 강하게 연결되는지 보는 배수. |
| Specialty→입원 전환 / admissionConv | specialty/primary care 확장이 실제 입원 볼륨으로 전환되는 비율. |
| Loop 구축비(1회) | capex. 초기 구축 투자액. |
| 운용비 고정 / opexFixed | 매년 고정으로 드는 운영비. |
| 운용비 환자당 / opexPerPt | 등록·관리 환자 1명당 연간 운영비. |
| p | percentile, 백분위 단위. PEPPER `60p`는 60번째 백분위라는 뜻이다. |

### 14.7 계산식 편집 패널·변수명

| 용어 | 의미 |
| --- | --- |
| 계산식 수동 편집 | 화면에서 내부 계산식을 직접 수정하는 패널. |
| 전체 기본식 복원 | 모든 수식을 코드 기본값으로 되돌리는 버튼. |
| 복원 | 특정 수식 하나만 기본값으로 되돌리는 버튼. |
| 모든 계산식 정상 | 현재 입력한 수식들이 모두 계산 가능하다는 상태 표시. |
| 계산식 오류 | 수식 문법이 허용 범위를 벗어나거나 계산 결과가 유효하지 않은 상태. 해당 수식은 기본식으로 계산된다. |
| fallback | 오류나 데이터 부재가 있을 때 사용하는 대체 기본식. |
| FORMULA_DEFAULTS | 수동 편집 가능한 기본 계산식 목록. |
| FORMULA_META | 계산식 편집 패널의 그룹·라벨·표시 순서를 정의하는 목록. |
| safeEvalFormula | 사용자가 입력한 수식을 제한된 문법으로만 계산하는 안전 평가 함수. |
| min/max/abs/round/floor/ceil/pow | 계산식 편집에서 허용하는 함수. 각각 최소/최대/절댓값/반올림/내림/올림/거듭제곱이다. |
| pi / π | 등록전환율. panel 중 실제 관리 프로그램에 등록되는 비율. |
| lambda / λ | 원가 시너지 배수. 여러 B2 레버를 함께 켰을 때 추가로 인정하는 상승분. |
| kappa / κ | 케어 밀도 S-curve 계수. 원격케어가 충분히 확산되어야 LOS/HRR 시너지를 인정한다. |
| selBias | 선택편의 보정계수. 건강관리 의지나 기관 선택효과로 업사이드가 과대평가되는 것을 낮춘다. |
| rcmGap | 목표 실현율과 현재 실현율의 차이. |
| rcmBase | RCM 계산의 기준액. grossCharges가 있으면 실현율 갭 방식, 없으면 Part A fallback. |
| grossChargeFlag | grossCharges가 입력됐는지 나타내는 0/1 플래그. |
| rcmRate | Part A fallback에서 사용하는 RCM uplift 비율. |
| pepperCap | PEPPER 위험에 따른 RCM 상한. 80p 초과 시 0.5. |
| teleGrossAll | W+M1+M2+M3의 payer 적용 전 원격케어 gross 합계. |
| teleTM / teleMA / teleMedicaid / teleCommercial | payer별 원격케어 회수액. |
| clawback | ACO 음결합 차감액. |
| cmsSavingsPool | TM ACO 귀속 퇴원에서 발생 가능한 CMS 절감 풀. |
| b3_tm | TM shared savings 중 병원 회수분. |
| b3_ma | MA HCC·품질 업사이드 중 병원 회수분. |
| costBase | B2 원가 절감 항목의 기본합. |
| couplingGain | λ·κ 커플링으로 추가 인정되는 원가 시너지. |
| synergyBase | λ·κ가 적용되는 LOS+HRR 절감 기반액. |
| moduleScale | B2 cost 레버를 몇 개 켰는지에 따른 조합 스케일. |
| careKappa | π S-curve에서 계산된 케어 밀도 계수. |
| occGate | 점유율 기반 throughput 실현 게이트. 낮은 점유율에서는 빈 병상이 있어도 추가 수익을 낮게 본다. |
| capUtil | 병상 capacity 사용률. |
| rmultEff | regime 배수와 APCM floor를 반영한 실제 B3 회수 배수. |
| apcmActive | 원격케어/APCM 레버가 켜져 있는 상태. |
| apcmFloor | APCM 게이트 때문에 B3 회수 배수를 최소 0.5로 올린 상태. |
| enrolledTelecare | 원격케어가 켜졌을 때 opex 환자당 비용을 적용할 등록 환자 수. |
| baselinePartA / baselineGrossCharges | 5개년 동적 계산에서 HRRP/RCM을 과대계상하지 않기 위해 고정해 쓰는 기준 Part A/gross charges. |
| yearDischarges / yearPartA / yearPanel / yearOcc / yearGrossCharges | v3.8 동적 모델에서 해당 연도별로 재계산된 입력값. |
| netInvestment | RHTP offset 차감 후 투자액. |
| npvInitial | NPV 계산의 초기 투자 현금흐름. 보통 음수다. |
| npvTerm | 각 연도 순 ΔEBITDA를 10% 할인한 NPV 항목. |
| totalEconomicImpact | Y5 순 ΔEBITDA와 Y5 B4 recurring을 합친 표시용 경제효과. |

## 변경 이력

- v3.0 Capture×Coupling 2축 엔진 (payer×service 4-quadrant를 Capture 벡터로 흡수)
- v3.1 capex/opex 분리 · 병상수/점유율(LOS throughput) · 에피소드 책임구조(θ regime)
- v3.2 원격케어 코호트 풀스택 · LOS haircut · B3 분리(TM/MA) · APCM↔VBC 게이트
- v3.3 B1 경로 청구 엔진(W·M1·M2 flow=퇴원수 / M3 stock=panel) · M1↔RCM 경계 분리
- v3.5 CMS AHCAH 실측 savEp 밴드 적용 · selBias 보정계수 신설 · B3/LOS IC 방어문구 추가
- v3.6 κ S-curve(π 30% inflection) 적용 · selBias를 MA HCC·품질에도 확장
- v3.7 payer mix(TM/MA/Medicaid/Commercial) 명시 분리 · Medicaid mk=0.10 적용 · Commercial 계산 0
- v3.7.1 핵심 계산식 수동 편집 패널 추가 · 오류 시 기본식 fallback
- v3.8 5개년 동적 확산 · B0 Volume Expansion · B4 RHTP · RCM 실현율 갭 · 내부 수식 편집 범위 확대

## 한 줄 결론

1차 컷으로 구조는 적정, 숫자는 밴드로만. 어느 레버가 어디서 움직이나를 보는 스크리너로 쓰고, 프라이싱 확정은 [DR] 값 교체 후.
