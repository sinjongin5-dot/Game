크로스링크 멀티플레이 서버
========================

[GitHub 기존 저장소에 업로드]
- sinjongin5-dot/Game 저장소를 PC에 clone한 뒤, 이 폴더 전체를 저장소 최상위에 복사
- Game\crosslink-multi\deploy-to-github.bat 실행
- 기존 저장소 파일은 삭제하거나 덮어쓰지 않고 crosslink-multi 폴더만 추가

[프로젝트]
- public/index.html : 게임 클라이언트
- server.js         : WebSocket 멀티플레이 서버
- 관리자 콘솔       : 로컬 CMD 또는 원격 PowerShell

[로컬 PC에서 실행]
1. Node.js 18 이상 설치: https://nodejs.org
2. 이 폴더에서 start-server.bat 실행
3. 표시된 http://localhost:3000 주소로 접속
4. 같은 와이파이의 친구는 CMD에 표시된 http://내부IP:3000 주소로 접속

[인터넷에 공개 배포 - Render]
1. GitHub 업로드 후 https://render.com 에 로그인
2. New > Web Service에서 저장소 sinjongin5-dot/Game 연결
3. Root Directory를 crosslink-multi 로 설정
4. Runtime: Node, Build Command: npm install, Start Command: npm start
5. Health Check Path: /status
6. Environment에 ADMIN_TOKEN을 추가하고 길고 임의적인 비밀값 설정
7. 배포가 끝나면 Render가 제공한 https://서비스이름.onrender.com 주소를 친구에게 공유
8. 무료 인스턴스는 유휴 시간 이후 잠들 수 있어 첫 접속에 대기 시간이 생길 수 있음

[원격 관리자 콘솔]
1. Render 대시보드에서 해당 서비스의 Environment를 열기
2. ADMIN_TOKEN 값을 확인 (render.yaml에서 자동 생성)
3. Windows PowerShell에서 이 폴더의 admin-console.ps1 실행
4. 서버 주소와 ADMIN_TOKEN 입력
5. 아래 명령어 사용

  help                         관리자 명령어
  players                      접속자 ID와 이름 확인
  rename 2 별명                2번 플레이어의 표시 이름 변경 (최대 8자)
  resetname 2                  원래 이름으로 복구
  prank 2 깜짝 놀랐지?         해당 플레이어에게 일회성 알림
  announce 서버 이벤트 시작!   전체 공지
  exit                         관리자 콘솔 종료

[로컬 CMD 관리자 명령]
서버 실행 창에서 다음 명령을 바로 입력할 수 있음:
  help / players / rename <ID> <이름> / resetname <ID>
  prank <ID> <메시지> / announce <메시지>

[멀티 기능]
- 같은 맵에 있는 다른 플레이어 표시
- 플레이어 간 대전 신청 및 수락
- T 키 또는 채팅 버튼으로 채팅
- 접속자 목록 및 대전 상태 표시
- 관리자 이름 변경 및 공지

[주의]
- ADMIN_TOKEN은 비밀번호처럼 취급하고 다른 사람에게 공유하지 마세요.
- 이름 변경은 현재 접속 세션에 적용되며, 재접속하면 게임 저장 데이터의 이름으로 돌아갑니다.
- prank는 일회성 알림이며 플레이어 저장 데이터나 대전 결과를 변경하지 않습니다.
- Render 배포는 GitHub 업로드와 별도 단계이며, 이 저장소에 파일을 올리는 것만으로 서버가 자동 실행되지는 않습니다.
- 서버는 WebSocket을 사용합니다. 프록시/호스팅 서비스에서 WebSocket 연결을 허용해야 합니다.
