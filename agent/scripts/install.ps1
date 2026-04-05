# Usage:
#   Invoke-WebRequest -Uri "https://your-backend/install.ps1" -OutFile install.ps1
#   .\install.ps1 -Token "YOUR_TOKEN" -Master "wss://your-backend/ws/agent"

Param(
    [Parameter(Mandatory = $true)]  [string] $Token,
    [Parameter(Mandatory = $true)]  [string] $Master
)

# ── Require Administrator ─────────────────────────────────────────────────────
$currentPrincipal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator. Exiting."
    exit 1
}

# ── Derive HTTPS base URL ─────────────────────────────────────────────────────
$BaseUrl = $Master -replace '^wss://', 'https://' -replace '/ws/agent$', ''
$BinDir  = "C:\Program Files\10KK-Agent"
$CertDir = "$BinDir\certs"
$BinPath = "$BinDir\10kk-agent.exe"

Write-Host "==> Creating directories"
New-Item -Path $CertDir -ItemType Directory -Force | Out-Null

# ── Download binary ───────────────────────────────────────────────────────────
$BinUrl = "$BaseUrl/downloads/10kk-agent-windows-amd64.exe"
Write-Host "==> Downloading 10kk-agent from $BinUrl"
Invoke-WebRequest -Uri $BinUrl -OutFile $BinPath -UseBasicParsing

# ── Enroll: request certificates ─────────────────────────────────────────────
Write-Host "==> Enrolling with master at $BaseUrl"
$Headers = @{ "Authorization" = "Bearer $Token"; "Content-Type" = "application/json" }
$EnrollResp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/v1/agent/enroll" -Headers $Headers

# Save certificates
$EnrollResp.ca_crt     | Set-Content -Path "$CertDir\ca.crt"     -Encoding UTF8 -NoNewline
$EnrollResp.client_crt | Set-Content -Path "$CertDir\client.crt" -Encoding UTF8 -NoNewline
$EnrollResp.client_key | Set-Content -Path "$CertDir\client.key" -Encoding UTF8 -NoNewline

# Restrict key permissions to SYSTEM + Administrators only
$acl = Get-Acl "$CertDir\client.key"
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    "BUILTIN\Administrators", "FullControl", "Allow")
$acl.SetAccessRule($rule)
Set-Acl "$CertDir\client.key" $acl

Write-Host "  Certificates saved to $CertDir"

# ── Install Windows Service ───────────────────────────────────────────────────
Write-Host "==> Installing 10kk-agent as Windows Service"
& $BinPath -service install -master $Master -token $Token

# ── Start Service ─────────────────────────────────────────────────────────────
Write-Host "==> Starting 10kk-agent service"
Start-Service -Name "10kk-agent" -ErrorAction SilentlyContinue

$svc = Get-Service -Name "10kk-agent" -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq "Running") {
    Write-Host ""
    Write-Host "OK 10KK Agent installed and running."
    Write-Host "   Master  : $Master"
    Write-Host "   Logs    : Get-EventLog -LogName Application -Source '10kk-agent'"
} else {
    Write-Warning "Service may not be running. Check: Get-Service 10kk-agent"
}
