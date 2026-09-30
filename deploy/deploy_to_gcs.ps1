# ==============================================================================
# deploy_to_gcs.ps1
# Automated Google Cloud Storage Static Website Deployment (PowerShell)
# Center Hub: 21 Bournville Road, Rathmines NSW 2283
# ==============================================================================

param (
    [string]$BucketName = "rathmines-interactive-map",
    [string]$Region = "australia-southeast1"
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 Deploying Rathmines Interactive Map to Google Cloud Storage" -ForegroundColor Cyan
Write-Host "   Bucket:  gs://$BucketName" -ForegroundColor Yellow
Write-Host "   Region:  $Region" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check or Create Bucket
try {
    & gcloud storage buckets describe "gs://$BucketName" 2>$null
    Write-Host "[INFO] Bucket gs://$BucketName already exists." -ForegroundColor Green
} catch {
    Write-Host "[INFO] Creating Cloud Storage bucket gs://$BucketName in $Region..." -ForegroundColor Yellow
    & gcloud storage buckets create "gs://$BucketName" --location=$Region --default-storage-class=STANDARD --uniform-bucket-level-access
}

# 2. Configure Website Index and Error Pages
Write-Host "[INFO] Configuring bucket for static web hosting (main page: index.html)..." -ForegroundColor Yellow
& gcloud storage buckets update "gs://$BucketName" --web-main-page-suffix=index.html --web-error-page=index.html

# 3. Grant Public Read Access
Write-Host "[INFO] Granting public read access (roles/storage.objectViewer to allUsers)..." -ForegroundColor Yellow
& gcloud storage buckets add-iam-policy-binding "gs://$BucketName" --member=allUsers --role=roles/storage.objectViewer

# 4. Sync Files
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Write-Host "[INFO] Uploading static assets from $ProjectRoot..." -ForegroundColor Yellow

& gcloud storage rsync "$ProjectRoot" "gs://$BucketName" --recursive --exclude="\.git.*|\.system_generated.*|tests.*|deploy.*|\.idea.*|.*\.py"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "   Public URL: https://storage.googleapis.com/$BucketName/index.html" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
