# Rafeeq - Windows Install Script
# Run with: powershell -ExecutionPolicy Bypass -File .\install.ps1

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "   Rafeeq - Install Script" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""

# 1. Check Node.js
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Yellow
$nodeCheck = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCheck) {
    Write-Host "Node.js not found. Install from https://nodejs.org (v18+)" -ForegroundColor Red
    exit 1
}
$nodeVer = node -v
Write-Host "OK - Node.js $nodeVer" -ForegroundColor Green

# 2. Ionic CLI globally
Write-Host ""
Write-Host "[2/6] Installing Ionic CLI globally..." -ForegroundColor Yellow
npm install -g @ionic/cli
Write-Host "OK - Ionic CLI installed" -ForegroundColor Green

# 3. React + react-scripts (must use TypeScript 4, not 5)
Write-Host ""
Write-Host "[3/6] Installing React and react-scripts..." -ForegroundColor Yellow
npm install --legacy-peer-deps react@18.2.0 react-dom@18.2.0 react-router-dom@5.3.4 react-scripts@5.0.1 typescript@4.9.5
Write-Host "OK - React installed" -ForegroundColor Green

# 4. Ionic packages
Write-Host ""
Write-Host "[4/6] Installing Ionic and Capacitor packages..." -ForegroundColor Yellow
npm install --legacy-peer-deps @ionic/react@7.0.0 @ionic/react-router@7.0.0 ionicons@7.0.0 @capacitor/core@5.0.0 @capacitor/app@5.0.0 @capacitor/preferences@5.0.0 @capacitor/splash-screen@5.0.0 @capacitor/status-bar@5.0.0 @capacitor/filesystem@5.0.0 @capacitor-community/sqlite@5.0.0
Write-Host "OK - Ionic and Capacitor installed" -ForegroundColor Green

# 5. Dev dependencies
Write-Host ""
Write-Host "[5/6] Installing dev dependencies..." -ForegroundColor Yellow
npm install --legacy-peer-deps --save-dev @capacitor/cli@5.0.0 @capacitor-community/electron@5.0.0 @types/react@18.0.0 @types/react-dom@18.0.0 @types/react-router-dom@5.3.0 concurrently@8.2.2 wait-on@7.2.0 webpack-bundle-analyzer@4.10.0
Write-Host "OK - Dev dependencies installed" -ForegroundColor Green

# 6. Capacitor platforms
Write-Host ""
Write-Host "[6/6] Adding Capacitor platforms..." -ForegroundColor Yellow

npx cap add @capacitor-community/electron
Write-Host "OK - Electron platform added" -ForegroundColor Green

$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
    npx cap add android
    Write-Host "OK - Android platform added" -ForegroundColor Green
} else {
    Write-Host "SKIP - Android Studio not found. Run 'npx cap add android' after installing it." -ForegroundColor Yellow
}

Write-Host "SKIP - iOS requires macOS. Run 'npx cap add ios' on a Mac." -ForegroundColor Yellow

# Done
Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "   Install complete!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Start dev server  : npm start"
Write-Host "  Build production  : npm run build:prod"
Write-Host "  Open Electron     : npm run electron:dev"
Write-Host "  Open Android      : npm run android:open"
Write-Host ""
