Write-Host "========================================" -ForegroundColor Green
Write-Host "  Pac-Man Moisson - Serveur Local" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Demarrage du serveur sur http://localhost:8080" -ForegroundColor Yellow
Write-Host ""
Write-Host "Appuyez sur Ctrl+C pour arreter le serveur" -ForegroundColor Yellow
Write-Host ""
npx http-server . -p 8080

