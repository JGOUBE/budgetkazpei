$ErrorActionPreference = 'Stop'
$project = 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei'
$backup = 'C:\Users\Jack.LAPTOP-2USDKF0K\budgetkazpei\.budgetkazpei-phone-backups\PremiumPhoneV3-20260824-183535'
Copy-Item (Join-Path $backup 'ProductPhoneMockup.jsx') (Join-Path $project 'src\components\landing\ProductPhoneMockup.jsx') -Force
Copy-Item (Join-Path $backup 'HeroProductDemo.jsx') (Join-Path $project 'src\components\landing\HeroProductDemo.jsx') -Force
Copy-Item (Join-Path $backup 'landing-public.css') (Join-Path $project 'src\styles\landing-public.css') -Force
Write-Host 'Rollback PremiumPhone V3 termine.' -ForegroundColor Green
