# ASSET_LICENSES — 에셋 출처와 라이선스

## 요약
- 이 프로젝트의 **3D 모델(사자, 검투사, 방패, 검, 투구 등), 텍스처, 효과음, 음악은 모두 이 저장소의 생성 스크립트가 만들어 낸 원본**입니다. 외부 사이트에서 내려받은 모델·사운드·이미지는 **사용하지 않았습니다**.
- 제작 환경의 네트워크 정책이 외부 에셋 사이트(Sketchfab, Poly Haven, Quaternius, Freesound 등)에 대한 접근을 차단하고 있어 실제 다운로드와 라이선스 확인이 불가능했습니다. 확인하지 못한 에셋은 배포용으로 쓰지 않는다는 원칙에 따라, 전부 자체 생성 파이프라인으로 대체했습니다.
- 생성 결과물은 이 프로젝트의 일부로서 프로젝트 라이선스(저장소 소유자 지정)에 따릅니다. 외부 저작물이 섞여 있지 않으므로 별도의 표시 의무가 없습니다.

## 자체 생성 에셋
| 파일 | 제작 | 방법 | 비고 |
|---|---|---|---|
| `public/assets/models/lion.glb` | 이 프로젝트 | `tools/gen-lion.ts` — SDF 해부학 볼륨 → 서피스넷 메싱 → 본 가중치 → 갈기 카드, 33개 본 | 털 셸/갈기 셰이더는 `src/render/furMaterial.ts` |
| `public/assets/models/gladiator.glb` | 이 프로젝트 | `tools/gen-gladiator.ts` — 인체/청동 투구/정강이받이/마니카/가죽/천/글라디우스/스쿠툼, 16개 본 | |
| `public/assets/textures/shield_face.png` | 이 프로젝트 | `tools/gen-textures.ts` 절차적 페인팅(번개·날개 문양, 마모) | 도형은 직접 작도, 기존 로고/문장 복제 아님 |
| 모래·석재·깃발·털·피부·금속 재질 | 이 프로젝트 | 셰이더 내 절차적 생성 (`src/render/*Material*.ts`) | 이미지 파일 없음 |
| `public/assets/audio/*.ogg` (40개) | 이 프로젝트 | `tools/gen-audio.py` — numpy/scipy 로 합성 (성대 펄스+포먼트, 필터링 노이즈, 비조화 부분음 등) | 녹음/샘플 사용 없음. 음악 3곡(calm/battle/phase2)과 스팅 포함 |

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
