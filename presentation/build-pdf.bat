@echo off
REM Rebuild 3D-Forge-MJ-Team.pdf from index.html after dropping images into img\
setlocal
set DIR=%~dp0
set HTML=%DIR%index.html
set OUT=%DIR%3D-Forge-MJ-Team.pdf

set EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" set EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe
if not exist "%EDGE%" (
  echo Could not find Microsoft Edge. Open index.html in a browser and Print to PDF instead.
  pause
  exit /b 1
)

echo Building PDF...
"%EDGE%" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="%OUT%" "file:///%HTML:\=/%"
echo.
echo Done: %OUT%
pause
