@echo off
setlocal enabledelayedexpansion

if /I "%~1"=="-cf" (
  set "OUT=%~2"
  set "ENTRY=%~3"
  if "%OUT%"=="" goto :delegate
  if "%ENTRY%"=="" goto :delegate

  set "ORIG=%CD%"
  set "STAGE=%TEMP%\ebtar-%RANDOM%%RANDOM%"
  mkdir "%STAGE%" >nul 2>&1

  robocopy "%ORIG%\%ENTRY%" "%STAGE%\%ENTRY%" /E /NFL /NDL /NJH /NJS /NP >nul
  if errorlevel 8 (
    exit /b 1
  )

  pushd "%STAGE%" >nul
  C:\Windows\System32\tar.exe -cf "%ORIG%\%OUT%" "%ENTRY%"
  set "CODE=%ERRORLEVEL%"
  popd >nul

  rmdir /s /q "%STAGE%" >nul 2>&1
  exit /b %CODE%
)

:delegate
C:\Windows\System32\tar.exe %*
exit /b %ERRORLEVEL%
