@echo off
setlocal
cd /d "%~dp0services\receipt-scanner"
set PYTHONPATH=%CD%\tests
.venv\Scripts\python.exe -m unittest tests.test_parser_v2_foundation -v
endlocal
