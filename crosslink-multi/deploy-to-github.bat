@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
git rev-parse --show-toplevel >nul 2>nul
if errorlevel 1 (
  echo 이 파일은 sinjongin5-dot\Game 저장소를 로컬에 clone한 폴더 안에 넣고 실행해야 합니다.
  echo 예: Game\crosslink-multi\deploy-to-github.bat
  pause
  exit /b 1
)
git add crosslink-multi
if errorlevel 1 goto :fail
git commit -m "Add Crosslink multiplayer server"
if errorlevel 1 echo 변경사항이 없거나 commit에 실패했습니다.
git push origin main
if errorlevel 1 goto :fail
echo GitHub 업로드 완료!
pause
exit /b 0
:fail
echo GitHub 업로드에 실패했습니다. git remote와 로그인 상태를 확인하세요.
pause
exit /b 1
