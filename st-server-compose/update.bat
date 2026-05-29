@echo off
setlocal enabledelayedexpansion

set TTGOPS=%~dp0ttgops-cli.exe
set CFG=%~dp0.ttgops-cli.yaml

REM ===== 在这里直接配置镜像列表 =====
set IMAGES=^
harbor-sh.dailygn.com/pst/tgateserver:master-latest ^
harbor-sh.dailygn.com/pst/gameserver:master-latest ^
harbor-sh.dailygn.com/pst/scenexserver:master-latest ^
harbor-sh.dailygn.com/pst/globalserver:master-latest ^
harbor-sh.dailygn.com/pst/matcherserver:master-latest

echo Using config: %CFG%
if not exist "%CFG%" (
    echo Config file not found: %CFG%
    exit /b 1
)

echo ==============================
echo Pull images via ttgops-cli
echo ==============================

for %%i in (%IMAGES%) do (
    echo.
    echo Pulling %%i ...
    "%TTGOPS%" -c "%CFG%" icr pull %%i
    if errorlevel 1 (
        echo Failed to pull %%i
        exit /b 1
    )
)

echo.
echo All images pulled successfully.
pause
