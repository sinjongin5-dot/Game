# ARENA — 모래와 송곳니

고대 콜로세움의 모래 경기장에서 검투사가 되어 거대한 숫사자와 일대일로 맞서는 **3D 3인칭 소울라이크 보스 결투**.
TypeScript + Vite + Three.js, 충돌/캐릭터 이동은 Rapier, 모델·텍스처·사운드는 전부 이 저장소의 스크립트로 생성합니다.

타이틀 → 입장 연출 → 결투(2페이즈) → 사망/재도전 → 승리 화면까지 하나로 연결되어 있습니다.

## 실행

```bash
npm install
npm run dev        # 개발 서버 http://localhost:5173  (F3: 진단 오버레이/히트박스)
npm run build      # 타입 검사 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기 http://localhost:4173
npm test           # 단위/통합 테스트 (vitest)
npm run typecheck  # tsc --noEmit
```

에셋 재생성(이미 커밋되어 있으므로 보통 필요 없음):

```bash
npx tsx tools/gen-lion.ts        # public/assets/models/lion.glb
npx tsx tools/gen-gladiator.ts   # public/assets/models/gladiator.glb
npx tsx tools/gen-textures.ts    # public/assets/textures/shield_face.png
python3 tools/gen-audio.py       # public/assets/audio/*.ogg  (numpy, scipy, ffmpeg 필요)
npx tsx tools/build-fonts.ts     # UI 글자 슬라이스만 골라 public/assets/fonts 에 복사
```

브라우저 종단 간 테스트(헤드리스 Chromium + SwiftShader, 개발 서버 실행 필요):

```bash
npm run dev &
node tools/e2e.mjs ui|input|fight|all      # 결과: captures/e2e-report.json, captures/e2e_*.png
```

## 조작법 (PC 키보드·마우스 권장)

| 입력 | 동작 |
|---|---|
| WASD | 카메라 기준 이동 |
| 마우스 | 카메라 회전 (포인터 잠금) |
| 좌클릭 | 약공격 (3연계) |
| Q | 강공격 |
| 우클릭 유지 | 방패 방어 |
| Space | 회피 (입력 방향 / 무입력 시 뒤로) |
| Shift 유지 | 달리기 |
| E | 회복 (2회) |
| F 또는 마우스 휠 클릭 | 사자 락온 전환 |
| Esc | 일시정지 (포인터 잠금 해제) |
| Enter / Space / 클릭 | 입장 연출 건너뛰기 |
| F3 | 진단 오버레이 + 히트박스/허트박스 표시 |

## 게임 규칙

- **HP 100 / 스태미나 100.** 약공격 18, 강공격 32, 회피 25. 스태미나가 부족하면 행동이 실행되지 않습니다. 소비 후 0.7초 뒤 회복이 시작되고, 방패를 든 동안엔 회복이 25% 로 느려집니다. 달리기는 계속 소모합니다.
- **회피**: 전체 0.72초, 무적은 시작 후 0.10~0.34초. 구간 밖에서는 피해를 입습니다. 입력 버퍼 0.15초.
- **방패**: 몸 앞 ±78° 안의 공격만 막습니다. 막을 때마다 스태미나가 줄고(앞발 26 / 물기 30 / 도약 48 / 돌진 55), 모자라면 가드 브레이크(1.1초 경직 + 피해 일부). 방패를 올린 직후 0.16초 안에 막으면(퍼펙트) 소모가 절반입니다.
- **회복**: 시작 즉시 횟수를 소비하고, 0.72초에 HP +45. 맞으면 중단되고 횟수는 돌아오지 않습니다.
- **사자(HP 900)**: 앞발 휘두르기 · 물기 · 도약 덮치기 · 돌진 · 측후방 견제. 체력 55% 이하에서 **한 번만** 2페이즈(포효, 무적 연출 2.3초)로 전환하며 *앞발 후 지연 물기*, *도약 후 추가 앞발*, 더 빠른 선회/접근 리듬이 추가됩니다. 돌진 중 벽/기둥에 부딪히면 1.9초 기절합니다. 강공격은 경직을 크게 쌓아 사자를 비틀거리게 하고(이후 7초간 경직 누적 30%), 비틀거리는 동안 피해가 1.35배입니다.
- 모든 공격은 *준비 → 유효 판정 → 후딜* 타임라인으로 판정하며, 같은 공격 인스턴스는 한 번만 피해를 줍니다. 애니메이션은 판정과 같은 데이터(검/발톱/머리 궤적)를 IK 로 풀어 그립니다.

## 구조

```
src/simulation/  고정 60Hz 시뮬레이션(규칙의 단일 원본): 플레이어, 사자 AI, 판정, 월드
src/combat/      공격 타임라인 데이터 (검·앞발·머리 궤적, 유효 구간) — 판정과 애니메이션이 공유
src/ai/          (AI 는 src/simulation/lion.ts 에 상태머신으로 구현)
src/physics/     Rapier 월드(벽/기둥/문/캐릭터 컨트롤러) + 테스트용 해석적 폴백
src/animation/   PoseRig(FK/2본 IK) + 검투사/사자 절차 애니메이터 (보행 위상은 실제 이동 속도로 구동)
src/render/      Three.js 씬: 콜로세움, 군중 인스턴싱, 털 셸 셰이더, 파티클, 카메라, 재질
src/audio/       WebAudio 엔진(공간음향/리버브/덕킹) + 이벤트→사운드 디렉터
src/input/       키보드/마우스/포인터 잠금/포커스 상실 처리
src/ui/          한국어 DOM UI (HUD/메뉴/결과)
src/diagnostics/ 히트박스 디버그 드로우 (F3)
tools/           에셋 생성기, 폰트 서브셋, e2e 하니스
tests/           vitest (규칙/물리/IK/봇 전투)
```

## 에셋 (자체 제작) — 자세한 내용은 `ASSET_LICENSES.md`

외부 리깅 에셋 사이트가 네트워크 정책으로 차단되어, 사자·검투사·무구·텍스처·사운드를 모두 코드로 생성했습니다.
따라서 품질 한계(특히 사자 얼굴/털, 인체 비례, 합성 사운드)는 `제한 사항` 항목을 참고하세요.
