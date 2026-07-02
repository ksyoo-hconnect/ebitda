# 루프 적용 EBITDA 개선 추정모델 — 팀 설명서 (v3.6)

이 문서는 코드와 함께 버전관리되는 정식 설명서입니다. 모델 수정 시 README도 함께 갱신하십시오. 버전 번호는 파일명·kicker·헤더·footer 4곳을 일치시킬 것.

## 0. 이 문서의 사용법

처음 보는 팀원: §1~2(30초·철학)만 읽어도 무엇인지 안다.  
숫자를 만지는 사람: §5~9. 코드를 고치는 사람: §10~12.  
§3(가드레일)은 전원 필독 — 여기를 어기면 모델이 조용히 틀린다.

## 1. 30초 요약

인수 대상 병원 수치를 넣으면, 인바이츠루프 도입 시 연간 EBITDA 개선폭을 추정한다. 8개 레버 ON/OFF(단계적 도입·미실행 반영), 레버 기여·순ΔEBITDA·회수기간이 실시간. 핵심 명제: "레버가 만든 돈 ≠ 병원이 가져가는 돈."

지불구조에 따라 만든 돈이 CMS로 새므로, "얼마 만들었나"와 "얼마 회수하나"를 반드시 분리한다.

## 2. 두 축의 철학

축1 — 무엇이 돈을 만드나 → 3개 레이어(B1/B2/B3)  
축2 — 누가 그 돈을 회수하나 → 게이트(Capture)

한 줄:

```text
ΔEBITDA = B1(payer 게이팅) + B2×(1+λ×κ) + B3(selBias×θ·regime / selBias×maVbc) − opex
```

capex는 EBITDA 밖, 회수기간에만 반영한다.

## 3. 가드레일 — 전원 필독

1. 게이트는 한 곳에. "누가 회수하나"는 전부 Capture에서. `m`·`θ`·`%TM`을 여러 군데 흩뿌리면 같은 달러를 두 번 깎거나 더한다.
2. `λ`는 B2(원가)에만. 원가 레버 간 상호작용(초가법성)만. 매출·가치층 금지.
3. `θ`는 B3의 TM shared savings에만. DRG 고정 원가(LOS)는 100% 회수라 `θ` 불필요.
4. 케어 인건비는 한 번만. 원격케어 margin에 이미 반영 → opex 환자당은 플랫폼 몫만.
5. 경로 청구 이중계상 두 곳: M1(입원 Part B) ↔ RCM(Part A DRG)은 별개 stream. W(AWV) → M3(APCM)은 순차지 중복 아님.

새 레버 추가 시 반드시 이 다섯에 비춰 검토.

## 4. 3개 레이어

| 레이어 | 의미 | 예시 | 게이트 | 확실성 |
| --- | --- | --- | --- | --- |
| B1 직접수익 | 청구 현금 | 원격케어(경로)·RCM·Self-Pay전환 | payer 게이팅 | 높음 |
| B2 운영효율 | 원가·throughput | Self-Pay원가·LOS·HRR·Agency | LOS/HRR ×(1+λ×κ) | 중간 |
| B3 가치기반 | 시스템 절감 | VBC(TM shared / MA HCC) | selBias×θ·regime / selBias×maVbc | 지불구조 종속 |

## 5. B1 경로 청구 엔진 (v3.3 핵심)

원격케어는 단일 PMPM이 아니라 환자 경로 전 구간 청구. 모수가 둘로 갈림:

```text
W  예방·관문  = panel × AWV포착률 × $150 × margin      (flow; APCM 개시 관문)
M1 입원 PartB = 퇴원수 × $400 × 포착률 × margin         (flow; RCM=Part A와 별개)
M2 퇴원후 TCM = 퇴원수 × TCM적격률 × $230 × margin       (flow; 99495/96, 30일 1회)
M3 종단       = 등록panel(panel×π) × netPMPM × 12       (stock; APCM·RPM 코호트 스택)
```

W·M1·M2는 퇴원수(flow), M3만 등록 panel(stock)에 연동 → 볼륨·throughput 늘면 B1 증가.

합계에 payer 스플릿(TM×1 / MA×m) + ACO 음결합 차감.

M3 코호트 스택: 만성(APCM L2+RPM)·QMB복합(L3+RPM+BHI)·행동건강(+CoCM)·경증(L1). 가중 gross 약 $181/월 × margin × adherence. 배타규칙(APCM↔CCM·PCM·TCM)이라 18코드 합 아님.

## 6. B2 원가 — LOS haircut

```text
ΔLOS × 1일당변동비 × (퇴원수 × 대상비중) × realizable haircut + throughput
```

대상비중: pathway 최적화 가능 퇴원 서브셋(전체 아님).  
realizable haircut: 진짜 원가에서 빠지는 몫만(0.4일 단축이 곧 FTE절감 아님 — step-fixed 착시).  
throughput: 빈 병상→신규환자, 점유율 게이팅(55%↓ 거의 0, 85%+ 완전 실현).

## 7. B3 VBC — CMS AHCAH 실측 앵커

```text
TM shared savings = 퇴원수 × %TM × ACO귀속 × CMS 절감/에피소드 × selBias × θ × regime배수
MA HCC·품질       = MA lives × HCC값 × maVbc × selBias
```

CMS AHCAH 30일 절감 밴드:

- 보수: $1,088(top-10 볼륨가중에 선택편의 보수 반영)
- 기본: $1,209(볼륨가중 raw)
- 공격: $1,640(CMS Overall, 25 DRG)

`selBias` 기본 0.90은 HCC gap(2.04/2.26≈0.90)을 이용한 순귀속 근사다. v3.6부터는 TM shared savings뿐 아니라 MA HCC·품질 업사이드에도 적용한다. 자발적 건강관리 의지나 기관 선택편의로 인한 업사이드 착시를 낮추는 보수적 밴드 조정계수이며, 정식 위험보정 point estimate는 아니다.

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
| awvRate/m1Rate/tcmRate(경로포착) | .25/.30/.20 | .45/.50/.40 | .65/.70/.60 |
| dLOS/losReal | .2/.40 | .4/.60 | .7/.85 |
| savEp | 1088 | 1209 | 1640 |
| theta/lambda | .10/.10 | .35/.25 | .60/.45 |
| kappa(S-curve, derived from pi) | ≈.026 | ≈.504 | 1.000 |
| hccVal/maVbc | 200/.30 | 500/.55 | 1000/.75 |
| cmCase | 2000 | 4000 | 7000 |

## 10. 코드 지도

- `SCEN` — 3-tier 파라미터. 숫자 튜닝은 여기.
- `REGIME` — 책임구조 4종·θ배수. 지불모델 추가는 여기.
- `COHORTS` + `AWV_VAL`·`M1_VAL`·`TCM_VAL` — 경로 청구 단위값. 스택·단가 수정 여기.
- `COST_KEYS` — λ 걸리는 원가 레버. B2 추가 시 등록.
- `LEVERS` — 8개 레버 표시정보.
- `compute()` — 핵심 엔진. B1(경로)→B2(haircut→λ×κ→throughput)→B3(selBias→θ/maVbc)→net→payback. 반환 `parts`에 레버·경로별 값.
- `App()` — 화면·토글·waterfall·경로카드·경고·입력.
- `styles` — 디자인 토큰.

## 11. 업그레이드 가이드

새 레버 추가:

1. 어느 레이어인지 결정(게이트·λ·θ 여부가 갈림).
2. `LEVERS`에 추가 → `compute()`에 공식, `parts`에 추가.
3. B2면 `COST_KEYS` 등록. B3면 `θ·regime` 또는 `maVbc` 곱.
4. waterfall items·레버카드 val·초기 lv state에 추가.

튜닝만: `SCEN` 숫자만. 근거(공개데이터/실측) 출처를 주석으로.

커밋 전 체크리스트:

- [ ] 순수 FFS에서 B3(TM) 거의 죽고, telecare 켜면 θ 0.5 floor 뜨나?
- [ ] cost 레버 1개만 켜면 λ=0인가?
- [ ] telecare OFF 또는 π 낮은 시나리오에서 κ가 LOS/HRR 시너지를 보수적으로 낮추는가?
- [ ] selBias를 낮추면 TM shared savings와 MA HCC·품질 업사이드가 함께 줄어드는가?
- [ ] 점유율 50%↓에서 throughput=0인가?
- [ ] PEPPER>80에서 RCM 반토막·경고 뜨나?
- [ ] 퇴원수 올리면 W·M1·M2(flow) 함께 커지나?
- [ ] capex가 net에서 안 빠지고 회수기간만 반영되나?

## 12. 알려진 한계 & 다음 버전

- 파라미터 절반이 [DR]/[ASS] 추정 → 이 도구는 point estimate가 아니라 밴드·구조 스크리너. data-room 열리면 실청구·실LOS·실점유로 교체.
- λ·κ는 근사(단일모듈도 완전히 깨끗하진 않음) → 신뢰구간으로.
- regime 단일 선택 → 실제는 TM-ACO·MA blend. v3.4 후보: TM 볼륨의 ACO/TEAM 편입률 분리.
- 경로 청구 적격률(AWV 연1회·TCM 30일 1회·배타규칙)이 이론최대와 실현치의 갭 → 실데이터 검증.

## 13. 용어집

EBITDA(감가상각 전 영업이익) · capex/opex(구축비/운용비) · DRG(입원 정액지불)  
HRRP(재입원 페널티 최대3%, TM) · MSPB/ACO(환자당 총지출/공유절감)  
TEAM(2026 의무 번들) · APCM(월 번들 1차진료 관리, VBC 관문) · TCM(퇴원 전이케어)  
AWV(연차건강검진) · PEPPER(코딩 outlier 리포트) · λ(원가 시너지 배수) · κ(케어 밀도 S-curve) · θ(회수율)  
m(MA 원격 회수율) · maVbc(MA 가치기반 회수율)

## 변경 이력

- v3.0 Capture×Coupling 2축 엔진 (payer×service 4-quadrant를 Capture 벡터로 흡수)
- v3.1 capex/opex 분리 · 병상수/점유율(LOS throughput) · 에피소드 책임구조(θ regime)
- v3.2 원격케어 코호트 풀스택 · LOS haircut · B3 분리(TM/MA) · APCM↔VBC 게이트
- v3.3 B1 경로 청구 엔진(W·M1·M2 flow=퇴원수 / M3 stock=panel) · M1↔RCM 경계 분리
- v3.5 CMS AHCAH 실측 savEp 밴드 적용 · selBias 보정계수 신설 · B3/LOS IC 방어문구 추가
- v3.6 κ S-curve(π 30% inflection) 적용 · selBias를 MA HCC·품질에도 확장

## 한 줄 결론

1차 컷으로 구조는 적정, 숫자는 밴드로만. 어느 레버가 어디서 움직이나를 보는 스크리너로 쓰고, 프라이싱 확정은 [DR] 값 교체 후.
