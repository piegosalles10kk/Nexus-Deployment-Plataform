param(
    [Parameter(Mandatory=$true)]
    [string]$token,

    [Parameter(Mandatory=$true)]
    [string]$master
)

# Exit on error
$ErrorActionPreference = "Stop"

# Derive HTTP/S base URL from the WS/S master URL (supports both ws:// and wss://)
$baseUrl = $master -replace "^ws(s)?://", "http`$1://"
$baseUrl = $baseUrl -replace "/ws/agent$", ""

# Determine Architecture
$arch = if ([System.Environment]::Is64BitOperatingSystem) { "amd64" } else { "386" }

# In this phase, we only generate amd64 for Windows in Dockerfile
$binUrl = "$baseUrl/downloads/nexus-agent-windows-amd64.exe"
$installDir = "C:\NexusAgent"
$binPath = "$installDir\nexus-agent.exe"

Write-Host "==> Detected: windows/$arch"
Write-Host "==> Downloading nexus-agent from $binUrl"

if (!(Test-Path -Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

# Download the file
Invoke-WebRequest -Uri $binUrl -OutFile $binPath

Write-Host "==> Enrolling with master at $baseUrl"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/agent/enroll" -Method Post -Headers $headers -ErrorAction Stop | Out-Null
} catch {
    Write-Host "Note: Enrollment returned a non-success code (could already be enrolled)."
}

Write-Host "==> Installing nexus-agent as system service"

# Install as Windows Service using the built-in kardianos/service arguments
$installArgs = "-service install -master `"$master`" -token `"$token`""
Start-Process -FilePath $binPath -ArgumentList $installArgs -Wait -NoNewWindow

# Start the service
Write-Host "==> Starting nexus-agent service"
$startArgs = "-service start"
Start-Process -FilePath $binPath -ArgumentList $startArgs -Wait -NoNewWindow

Write-Host ""
Write-Host "✓ Nexus Agent installed and running on Windows."
Write-Host "  Master  : $master"
Write-Host "  Logs    : Consult Windows Event Viewer (Application Log) or Windows Services (services.msc)"
