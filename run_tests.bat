@echo off
chcp 65001 >nul 2>&1
title Normalizer - Run Tests

echo.
echo ==================================================
echo          NORMALIZER - Running All Tests
echo ==================================================
echo.
echo   Frontend: Vitest (47 tests)
echo   Backend:  Pytest (29 tests)
echo.
echo ==================================================
echo.

:: ============================================
:: FRONTEND TESTS
:: ============================================
echo.
echo [1/2] FRONTEND TESTS (Vitest)
echo ------------------------------------------------
echo.
echo Checking dependencies...
echo.

cd /d D:\Opencode\OpenCode_models\Normalize\frontend

if not exist "node_modules\vitest" (
    echo Installing vitest dependencies...
    call npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
    echo.
)

echo Running Vitest tests...
echo ------------------------------------------------
echo.

call npm run test

if %errorlevel%==0 (
    echo.
    echo [OK] Frontend tests: PASSED
    set FRONTEND_RESULT=PASSED
) else (
    echo.
    echo [ERROR] Frontend tests: FAILED
    set FRONTEND_RESULT=FAILED
)

echo.
echo Press any key to continue with Backend tests...
pause >nul

:: ============================================
:: BACKEND TESTS
:: ============================================
echo.
echo [2/2] BACKEND TESTS (Pytest)
echo ------------------------------------------------
echo.

cd /d D:\Opencode\OpenCode_models\Normalize\backend

echo Checking dependencies...
echo.

python -c "import pytest" 2>nul
if %errorlevel% neq 0 (
    echo Installing pytest dependencies...
    pip install pytest pytest-asyncio httpx aiosqlite
    echo.
)

echo Running Pytest tests...
echo ------------------------------------------------
echo.

python -m pytest test_schemas.py -v --tb=short

if %errorlevel%==0 (
    echo.
    echo [OK] Backend tests: PASSED
    set BACKEND_RESULT=PASSED
) else (
    echo.
    echo [ERROR] Backend tests: FAILED
    set BACKEND_RESULT=FAILED
)

:: ============================================
:: SUMMARY
:: ============================================
echo.
echo.
echo ==================================================
echo               TEST RESULTS SUMMARY
echo ==================================================
echo.

if "%FRONTEND_RESULT%"=="PASSED" (
    echo   Frontend (Vitest):  [OK] PASSED
) else (
    echo   Frontend (Vitest):  [ERROR] FAILED
)

if "%BACKEND_RESULT%"=="PASSED" (
    echo   Backend (Pytest):   [OK] PASSED
) else (
    echo   Backend (Pytest):   [ERROR] FAILED
)

echo.
echo ==================================================
echo.

if "%FRONTEND_RESULT%"=="PASSED" if "%BACKEND_RESULT%"=="PASSED" (
    echo [SUCCESS] ALL TESTS PASSED!
) else (
    echo [WARNING] SOME TESTS FAILED
)

echo.
echo ==================================================
echo   Test locations:
echo   Frontend: D:\Opencode\OpenCode_models\Normalize\frontend\test\
echo   Backend:  D:\Opencode\OpenCode_models\Normalize\backend\test_schemas.py
echo ==================================================
echo.
pause