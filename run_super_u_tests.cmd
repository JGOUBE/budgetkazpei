@echo off
setlocal
cd /d "%~dp0services\receipt-scanner"
set PYTHONPATH=%CD%\tests
.venv\Scripts\python.exe -m unittest tests.test_receipt_parser_fr tests.test_quality_gate tests.test_super_u_parser -v
endlocal
