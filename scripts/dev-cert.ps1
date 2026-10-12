# Creates a local dev CA, trusts it for the current user, and writes the site certificate Vite serves.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "apps\web\.certs"
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$pfxPath = Join-Path $certDir "dev.pfx"
$passPath = Join-Path $certDir "passphrase.txt"
$passphrase = "tuoyu-dev"

if ((Test-Path $pfxPath) -and (Test-Path $passPath)) {
  exit 0
}

$ca = New-SelfSignedCertificate `
  -Subject "CN=Tuoyu Local Dev CA" `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -KeyExportPolicy Exportable `
  -KeyUsage CertSign, CRLSign `
  -NotAfter (Get-Date).AddYears(2) `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -Type Custom `
  -TextExtension @("2.5.29.19={critical}{text}CA=true&pathlength=0")

$server = New-SelfSignedCertificate `
  -Subject "CN=frp-oil.com" `
  -DnsName "frp-oil.com", "localhost" `
  -Signer $ca `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(1) `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")

$secure = ConvertTo-SecureString -String $passphrase -Force -AsPlainText
Export-PfxCertificate -Cert $server -FilePath $pfxPath -Password $secure | Out-Null
Set-Content -Path $passPath -Value $passphrase -Encoding ascii -NoNewline

$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($ca)
$store.Close()
