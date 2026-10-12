# ASSET_LICENSES — 에셋 출처와 라이선스

## 요약
- 이 프로젝트의 **3D 모델(사자, 검투사, 방패, 검, 투구 등), 텍스처, 효과음, 음악은 모두 이 저장소의 생성 스크립트가 만들어 낸 원본**입니다. 외부 사이트에서 내려받은 모델·사운드·이미지는 **사용하지 않았습니다**.
- 예외 하나: **검투사의 모션 캡처 애니메이션 5개**(강공격 도약 베기, 방패 막기, 사망, 납검, 180도 회전)는 사용자가 직접 내려받아 제공한 Mixamo(Adobe) 클립을 이 게임의 리그로 리타게팅한 것입니다. 아래 *Mixamo 애니메이션* 항목을 읽어 주세요.
- 제작 환경의 네트워크 정책이 외부 에셋 사이트(Sketchfab, Poly Haven, Quaternius, Freesound 등)에 대한 접근을 차단하고 있어 실제 다운로드와 라이선스 확인이 불가능했습니다. 확인하지 못한 에셋은 배포용으로 쓰지 않는다는 원칙에 따라, 전부 자체 생성 파이프라인으로 대체했습니다.
- 생성 결과물은 이 프로젝트의 일부로서 프로젝트 라이선스(저장소 소유자 지정)에 따릅니다. 외부 저작물이 섞여 있지 않으므로 별도의 표시 의무가 없습니다.

## 자체 생성 에셋
| 파일 | 제작 | 방법 | 비고 |
|---|---|---|---|
| `public/assets/models/lion.glb` | 이 프로젝트 | `tools/gen-lion.ts` — SDF 해부학 볼륨 → 서피스넷 메싱 → 본 가중치 → 갈기 카드, 33개 본 | 털 셸/갈기 셰이더는 `src/render/furMaterial.ts` |
| `public/assets/models/gladiator.glb` | 이 프로젝트 | `tools/gen-gladiator.ts` — 인체/청동 투구/정강이받이/마니카/가죽/천/글라디우스/스쿠툼, 16개 본 | |
| `public/assets/textures/shield_face.png` | 이 프로젝트 | `tools/gen-textures.ts` 절차적 페인팅(번개·날개 문양, 마모) | 도형은 직접 작도, 기존 로고/문장 복제 아님 |
| 모래·석재·깃발·털·피부·금속 재질 | 이 프로젝트 | 셰이더 내 절차적 생성 (`src/render/*Material*.ts`) | 이미지 파일 없음 |
| `public/assets/audio/*.ogg` (48개) | 이 프로젝트 | `tools/gen-audio.py`(효과음, 대기 음악, 스팅), `tools/gen-music.py`(보스전 음악 2곡) — numpy/scipy 로 합성 (성대 펄스+포먼트, 필터링 노이즈, 비조화 부분음, 톱니파 현/금관 등) | 녹음/샘플 사용 없음 |

## Mixamo 애니메이션 (사용자 제공, Adobe)
| 항목 | 내용 |
|---|---|
| 원본 | `sword_and_shield_attack`, `sword_and_shield_block`, `sword_and_shield_death`, `sheath_sword_1`, `sword_and_shield_180_turn` (Mixamo, FBX, 사용자가 직접 내려받아 대화에 첨부) |
| 이 저장소에 있는 것 | 리타게팅·베이크한 **회전/위치 곡선 데이터** `src/animation/mocapData.ts` 와 변환 도구 `tools/bake-anims.ts`. **원본 FBX 파일은 저장소에 넣지 않았습니다**(`assets-src/` 는 `.gitignore`). |
| 변환 | Mixamo 뼈 22개의 회전을 이 프로젝트 검투사 리그(T 자세 → 팔을 내린 자세)에 뼈 방향 기반으로 옮기고(`tools/bake-anims.ts` 주석 참고), 검/방패를 쥔 손의 쥐는 각도를 보정했습니다. 캐릭터 메시·텍스처는 Mixamo 것을 쓰지 않고 이 프로젝트 모델을 그대로 씁니다. |
| 라이선스 | Mixamo 애니메이션은 Adobe 계정으로 무료로 받아 상업 프로젝트를 포함한 자신의 게임/영상에 사용할 수 있고, **애니메이션 파일 자체를 단독으로 재배포·판매하는 것은 금지**되는 것으로 알고 있습니다(제 이해이며 법률 자문이 아닙니다 — 현재 약관은 Adobe 의 Mixamo FAQ/약관에서 직접 확인하세요). 그래서 원본 FBX 는 공개하지 않고, 게임에 내장된 변환 데이터만 포함했습니다. 저장소를 **공개**하거나 이 데이터를 단독으로 배포하려면 약관 해당 여부를 먼저 확인하세요. 문제가 되면 `src/animation/mocapData.ts` 를 지우고 `PlayerAttackDef.clip` 을 쓰지 않도록 하면(절차적 애니메이션으로 되돌림) 나머지 에셋은 영향이 없습니다. |
| 다시 만들기 | FBX 5개를 `assets-src/mocap/` 에 `attack.fbx, block.fbx, death.fbx, sheath.fbx, turn180.fbx` 이름으로 두고 `npx tsx tools/bake-anims.ts` |

## 제3자 소프트웨어 (런타임 번들)
| 구성요소 | 버전 | 라이선스 |
|---|---|---|
| three.js | 0.186 | MIT |
| @dimforge/rapier3d-compat (Rapier) | 0.21 | Apache-2.0 |
| Vite / Vitest / TypeScript / tsx | — | MIT / MIT / Apache-2.0 / MIT (개발 도구) |
| @gltf-transform/core, meshoptimizer, pngjs, playwright-core | — | MIT / MIT / MIT / Apache-2.0 (빌드·테스트 도구) |

## 글꼴 (SIL Open Font License 1.1)
| 글꼴 | 출처 | 파일 |
|---|---|---|
| Noto Serif KR (400/700) | npm `@fontsource/noto-serif-kr` (Google Fonts 배포본) | `public/assets/fonts/noto-serif-kr-*.woff2` (UI 에 쓰이는 글자 슬라이스만 포함) |
| Cinzel (latin 400/700) | npm `@fontsource/cinzel` | `public/assets/fonts/cinzel-latin-*.woff2` |

라이선스 전문: `public/assets/fonts/LICENSE-NotoSerifKR-OFL.txt`, `LICENSE-Cinzel-OFL.txt`.
OFL 은 글꼴의 포함·재배포를 허용하며, 글꼴 자체를 단독 판매하는 것만 금지합니다. 수정하지 않은 슬라이스 파일을 그대로 사용했습니다.

## 참고(복제 아님)
- 다크소울류 장르의 일반적인 규칙(스태미나·회피 무적·락온)만 참고했으며, 기존 게임의 캐릭터, 음악, 로고, UI, 고유 에셋은 사용하지 않았습니다.
- 갈레아(투구), 글라디우스, 스쿠툼은 고대 로마 무구의 일반적 형태를 참고해 직접 모델링했습니다.

## 필요 시 교체 방법
외부 에셋을 쓰고 싶다면 CC0/CC-BY 모델을 `public/assets/models/` 에 넣고 `src/render/assets.ts` 의 `MANIFEST` 와 본 이름 매핑(`src/rig/*.ts`)을 맞추면 됩니다. 이때 이 문서에 파일명·제작자·출처·라이선스·수정 내용·표시 의무를 추가하세요.

## 그래픽 업그레이드 (후처리/하늘/재질)

- 후처리(SSAO, 블룸, 갓레이, DOF, ACES 그레이딩), 절차적 하늘, 재질 셰이더, 군중 지오메트리, 사자·검투사 메쉬(해상도 상향 재생성)는 모두 이 저장소의 코드(`src/render/*`, `tools/gen-*.ts`)로 직접 작성·생성한 것입니다. 새로 추가한 외부 에셋·텍스처·HDRI 는 없고, 외부 이미지를 내려받거나 핫링크하지 않습니다.
