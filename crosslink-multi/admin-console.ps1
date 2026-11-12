$ErrorActionPreference = 'Stop'
Write-Host '=== Crosslink 원격 관리자 콘솔 ===' -ForegroundColor Cyan
$serverUrl = (Read-Host '서버 주소 (예: https://crosslink-multiplayer.onrender.com)').Trim().TrimEnd('/')
if (-not ($serverUrl -match '^https?://')) {
  Write-Host 'http:// 또는 https:// 로 시작하는 주소를 입력하세요.' -ForegroundColor Red
  exit 1
}
$token = Read-Host 'Render의 ADMIN_TOKEN 값'
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Host 'ADMIN_TOKEN이 비어 있습니다.' -ForegroundColor Red
  exit 1
}
Write-Host '명령어: help, players, rename 2 새이름, resetname 2, prank 2 메시지, announce 공지' -ForegroundColor Yellow
Write-Host '종료하려면 exit 입력' -ForegroundColor DarkGray
while ($true) {
  $command = Read-Host 'crosslink-admin'
  if ([string]::IsNullOrWhiteSpace($command)) { continue }
  if ($command -eq 'exit') { break }
  try {
    $body = @{ command = $command } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$serverUrl/admin" -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    Write-Host $response.message -ForegroundColor Green
    if ($response.players) {
      $response.players | Format-Table id, name, map, busy -AutoSize
    }
  } catch {
    Write-Host "요청 실패: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  }
}
