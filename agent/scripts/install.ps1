param(
    [Parameter(Mandatory=$true)]
    [string]$token,

    [Parameter(Mandatory=$true)]
    [string]$master
)

$ErrorActionPreference = "Stop"

# Derive HTTP base URL from WS URL
# e.g. wss://host/ws/agent -> https://host
$baseUrl = $master
if ($baseUrl -match "^wss://") {
    $baseUrl = $baseUrl -replace "^wss://", "https://"
} elseif ($baseUrl -match "^ws://") {
    $baseUrl = $baseUrl -replace "^ws://", "http://"
}
$baseUrl = $baseUrl -replace "/ws/agent$", ""

Write-Host "[Nexus] Base URL: $baseUrl"

# Determine install dir
$installDir = "C:\NexusAgent"
$binPath = $installDir + "\nexus-agent.exe"
$binUrl = $baseUrl + "/downloads/nexus-agent-windows-amd64.exe"

Write-Host "[Nexus] Creating directory: $installDir"
if (!(Test-Path -Path $installDir)) {
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
}

Write-Host "[Nexus] Downloading agent from: $binUrl"
Invoke-WebRequest -UseBasicParsing -Uri $binUrl -OutFile $binPath

Write-Host "[Nexus] Enrolling agent..."
$enrollUrl = $baseUrl + "/api/v1/agent/enroll"
$headers = @{
    "Authorization" = "Bearer " + $token
    "Content-Type"  = "application/json"
}

try {
    Invoke-RestMethod -Uri $enrollUrl -Method Post -Headers $headers -ErrorAction Stop | Out-Null
    Write-Host "[Nexus] Enrollment successful."
} catch {
    Write-Host "[Nexus] Enrollment note: " + $_.Exception.Message
}

Write-Host "[Nexus] Installing as Windows service..."
$installArgs = "-service install -master """ + $master + """ -token """ + $token + """"
Start-Process -FilePath $binPath -ArgumentList $installArgs -Wait -NoNewWindow

Write-Host "[Nexus] Starting service..."
Start-Process -FilePath $binPath -ArgumentList "-service start" -Wait -NoNewWindow

Write-Host "[Nexus] Done! Agent is running."
Write-Host "[Nexus] Check status in Windows Services (services.msc) or Event Viewer."
