@echo off

:: Define Redis installation directory
set REDIS_DIR=E:\program-rely\Redis-x64

:: Check if Redis directory exists
if not exist "%REDIS_DIR%" (
    echo Redis directory not found: %REDIS_DIR%
    echo Please check if the path is correct
    pause
    exit /b 1
)

:: Check if redis-server.exe exists
if not exist "%REDIS_DIR%\redis-server.exe" (
    echo redis-server.exe not found
    pause
    exit /b 1
)

:: Check if redis.windows.conf exists
if not exist "%REDIS_DIR%\redis.windows.conf" (
    echo redis.windows.conf not found
    echo Trying to use default configuration...
)

:: Change to Redis directory and start the service
echo Starting Redis service...
cd /d "%REDIS_DIR%"

:: Start Redis service
if exist "%REDIS_DIR%\redis.windows.conf" (
    start "Redis Server" redis-server.exe redis.windows.conf
) else (
    start "Redis Server" redis-server.exe
)

echo Redis service started
:: Wait a few seconds for the service to fully start
timeout /t 3 /nobreak > nul
echo Press any key to continue...
pause > nul