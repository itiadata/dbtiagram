param(
    [string]$OutDir = '.certs'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$certPath = Join-Path $projectRoot (Join-Path $OutDir 'zscaler-root-ca.pem')

Write-Host 'Scanning the Windows certificate store for Zscaler root CAs...'
$storePaths = @(
    'Cert:\LocalMachine\Root',
    'Cert:\CurrentUser\Root',
    'Cert:\LocalMachine\CA',
    'Cert:\CurrentUser\CA'
)

$found = @()
foreach ($storePath in $storePaths) {
    $found += Get-ChildItem $storePath -ErrorAction SilentlyContinue |
        Where-Object { $_.Subject -match 'Zscaler' }
}
$found = $found | Sort-Object Thumbprint -Unique

if ($found.Count -eq 0) {
    Write-Host ''
    Write-Host 'No Zscaler root CA found in the Windows certificate store.'
    Write-Host 'If this machine does NOT intercept HTTPS traffic, no action is needed.'
    Write-Host 'If it uses a different interception vendor, trust that vendor CA in the'
    Write-Host 'Windows certificate store and re-run this script.'
    exit 1
}

New-Item -ItemType Directory -Path (Split-Path $certPath) -Force | Out-Null

$pemLines = @()
foreach ($cert in $found) {
    $base64 = [Convert]::ToBase64String(
        $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
    )
    $pemLines += '-----BEGIN CERTIFICATE-----'
    for ($i = 0; $i -lt $base64.Length; $i += 64) {
        $pemLines += $base64.Substring($i, [Math]::Min(64, $base64.Length - $i))
    }
    $pemLines += '-----END CERTIFICATE-----'
}
$pemLines | Set-Content -Path $certPath -Encoding ASCII
Write-Host "Exported $($found.Count) Zscaler root CA cert(s) to $certPath"

$npmrcPath = Join-Path $projectRoot '.npmrc'
$npmrcLine = "cafile=$OutDir/zscaler-root-ca.pem"
$existing = if (Test-Path $npmrcPath) { Get-Content $npmrcPath -Raw } else { '' }
if ($existing -match '(?m)^cafile\s*=') {
    Write-Host "Project .npmrc already configures cafile; skipping."
}
else {
    Add-Content -Path $npmrcPath -Value $npmrcLine -Encoding ASCII
    Write-Host "Added '$npmrcLine' to project .npmrc"
}

[Environment]::SetEnvironmentVariable('NODE_EXTRA_CA_CERTS', $certPath, 'User')
Write-Host 'Set user environment variable NODE_EXTRA_CA_CERTS.'
Write-Host ''
Write-Host 'npm commands work immediately (cafile is read from the project .npmrc).'
Write-Host 'For npx / node fetch / @vscode/test-electron downloads, restart opencode'
Write-Host 'or your terminal so the NODE_EXTRA_CA_CERTS environment variable is picked up.'
