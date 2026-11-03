@echo off
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0"
set LOGFILE=%~dp0build.log
if exist "%LOGFILE%" del /f /q "%LOGFILE%" 2>nul

echo Build started at %date% %time% >> "%LOGFILE%"

echo ============================================================
echo   Metrika 0.3.0 - Build Release + NSIS Installer (Windows)
echo ============================================================
echo.
echo ============================================================ >> "%LOGFILE%"
echo   Metrika 0.3.0 - Build Release + NSIS Installer (Windows) >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo.                                                          >> "%LOGFILE%"

if exist "C:\Program Files\nodejs"       set PATH=C:\Program Files\nodejs;%PATH%
if exist "C:\Program Files (x86)\nodejs" set PATH=C:\Program Files (x86)\nodejs;%PATH%
if exist "%LOCALAPPDATA%\nodejs"         set PATH=%LOCALAPPDATA%\nodejs;%PATH%
if exist "%APPDATA%\nvm" for /f "delims=" %%v in ('dir /b "%APPDATA%\nvm" 2^>nul ^| findstr /r "^v" ^| sort /r') do (
  if exist "%APPDATA%\nvm\%%v\node.exe" (
    set PATH=%APPDATA%\nvm\%%v;%PATH%
    goto :after_nvm
  )
)
:after_nvm

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH. Install from https://nodejs.org/
  echo [ERROR] Node.js not found in PATH. Install from https://nodejs.org/ >> "%LOGFILE%"
  goto :endpause
)

echo [1/3] Clean old build artifacts...
if exist "release"          rmdir /s /q "release"          2>nul
if exist "dist"             rmdir /s /q "dist"             2>nul
if exist "build.log"        del /f /q   "build.log"        2>nul
if exist "%~dp0build.log"   del /f /q   "%~dp0build.log"   2>nul
echo Build started at %date% %time% > "%LOGFILE%"
echo       OK

echo.
echo [2/3] Compile TypeScript (main) + Vite (renderer)...
echo [2/3] Compile TypeScript (main) + Vite (renderer)... >> "%LOGFILE%"
call npm --prefix "%~dp0" run build >> "%LOGFILE%" 2>&1
set rc_build=%errorlevel%
echo.
echo ---- TypeScript + Vite output (last lines) ----
findstr /i /C:"built in" /C:"dist/renderer" /C:"error TS" /C:"?" "%LOGFILE%" 2>nul
echo ----
if %rc_build% neq 0 (
  echo [ERROR] Build step failed with code %rc_build%. See build.log for details.
  echo [ERROR] Build step failed with code %rc_build% >> "%LOGFILE%"
  notepad "%LOGFILE%"
  goto :endpause
)
echo       OK - dist/ ready
echo       OK - dist/ ready >> "%LOGFILE%"

echo.
echo [3/3] Package unpacked dir + NSIS installer via electron-builder...
echo [3/3] Package unpacked dir + NSIS installer via electron-builder... >> "%LOGFILE%"
echo       (this step can take 1-3 minutes - please wait, do not close the window)
echo.
set ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES=true

echo ---- First electron-builder attempt started ---- >> "%LOGFILE%"
call npx --no-install --prefix "%~dp0" electron-builder --projectDir "%~dp0" --win --publish never >> "%LOGFILE%" 2>&1
set rc=%errorlevel%

if %rc% EQU 0 goto :ok

echo.
echo First builder attempt returned code %rc%.
echo Most common cause in OneDrive folders = file lock during sync (EBUSY).
echo Cleaning temporary .tmp folders and retrying once...
echo.
echo First attempt rc=%rc%, cleaning tmp folders + retrying once >> "%LOGFILE%"
if exist "release\win-unpacked.tmp" (
  ping 127.0.0.1 -n 4 >nul
  rmdir /s /q "release\win-unpacked.tmp" 2>nul
)
if exist "release\__uninstaller-tmp" (
  ping 127.0.0.1 -n 2 >nul
  rmdir /s /q "release\__uninstaller-tmp" 2>nul
)
ping 127.0.0.1 -n 3 >nul

echo ============================================================
echo   SECOND RETRY - electron-builder (wait ~1-3 min more)
echo ============================================================
echo ============================================================  >> "%LOGFILE%"
echo   SECOND RETRY - electron-builder                        >> "%LOGFILE%"
echo ============================================================  >> "%LOGFILE%"
call npx --no-install --prefix "%~dp0" electron-builder --projectDir "%~dp0" --win --publish never >> "%LOGFILE%" 2>&1
set rc=%errorlevel%

if %rc% NEQ 0 (
  echo.
  echo [ERROR] electron-builder failed both times with exit code %rc%.
  echo.
  echo         Full log has been saved here:
  echo         %LOGFILE%
  echo.
  echo         Please open build.log in Notepad, scroll to the bottom,
  echo         and send the last ~40 lines.
  echo.
  echo TIP - the most common issue when project lives in OneDrive:
  echo       OneDrive sync locks .asar/.tmp files while electron-builder
  echo       tries to rename/unlink them -> EBUSY error.
  echo.
  echo       Quick fix: copy the whole project folder to a local non-synced
  echo       directory (example C:\Work\Metrika), then run build_installer.bat
  echo       from there. Installation is optional - will work from any folder.
  echo.
  notepad "%LOGFILE%"
  goto :endpause
)

:ok
echo.
echo ============================================================
echo   [OK] BUILD FINISHED
echo ============================================================
echo   Artifacts located in: %~dp0release
echo.
dir /b "release\*.exe"
dir /b "release\*.nsis.7z" 2>nul
if exist "release\win-unpacked\Metrika.exe" echo Portable app  =  release\win-unpacked\Metrika.exe
echo.
echo   Installer file  =  release\Metrika-Setup-0.3.0.exe
echo.
explorer "release"

:endpause
echo.
echo ====================================================================
echo   Log saved to  %LOGFILE%
echo   Exit codes:  Build=%rc_build%   Package=%rc%
echo ====================================================================
echo   PRESS ANY KEY TO CLOSE THIS WINDOW...
pause >nul
endlocal & exit /b %rc%
