# dexcli/test/mocks/mock-gemini.ps1
Write-Host "gemini> " -NoNewline

while ($line = Read-Host) {
    Write-Host "Mock response to: $line"
    Write-Host '```javascript'
    Write-Host '// file: mock-output.js'
    Write-Host 'console.log("mock artifact");'
    Write-Host '```'
    Write-Host "gemini> " -NoNewline
}