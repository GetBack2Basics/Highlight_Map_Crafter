#!/usr/bin/env bash
# ==============================================================================
# deploy_to_gcs.sh
# Automated Google Cloud Storage Static Website Deployment
# Center Hub: 21 Bournville Road, Rathmines NSW 2283
# ==============================================================================

set -euo pipefail

# Configuration
BUCKET_NAME="${1:-rathmines-interactive-map}"
REGION="${2:-australia-southeast1}"
PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null || echo '')}"

echo "============================================================"
echo "🚀 Deploying Rathmines Interactive Map to Google Cloud Storage"
echo "   Bucket:  gs://${BUCKET_NAME}"
echo "   Region:  ${REGION}"
echo "   Project: ${PROJECT_ID}"
echo "============================================================"

# 1. Create Bucket if it does not exist
if ! gsutil ls -b "gs://${BUCKET_NAME}" > /dev/null 2>&1; then
    echo "[INFO] Creating Cloud Storage bucket gs://${BUCKET_NAME} in ${REGION}..."
    gcloud storage buckets create "gs://${BUCKET_NAME}" \
        --location="${REGION}" \
        --default-storage-class=STANDARD \
        --uniform-bucket-level-access
fi

# 2. Configure Website Index and Error Pages
echo "[INFO] Configuring bucket for static web hosting (main page: index.html)..."
gcloud storage buckets update "gs://${BUCKET_NAME}" \
    --web-main-page-suffix=index.html \
    --web-error-page=index.html

# 3. Grant Public Read Access to All Users
echo "[INFO] Granting public read access (roles/storage.objectViewer to allUsers)..."
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
    --member=allUsers \
    --role=roles/storage.objectViewer

# 4. Sync Files to Bucket with optimized Cache-Control & Content-Types
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[INFO] Uploading static assets from ${SCRIPT_DIR}..."

# Upload HTML
gcloud storage rsync "${SCRIPT_DIR}" "gs://${BUCKET_NAME}" \
    --recursive \
    --exclude="\.git.*|\.system_generated.*|tests.*|deploy.*|\.idea.*|.*\.py"

# Set HTML cache control to short and CSS/JS to longer
gsutil -m setmeta -h "Cache-Control:no-cache, max-age=0" "gs://${BUCKET_NAME}/*.html" 2>/dev/null || true
gsutil -m setmeta -h "Cache-Control:public, max-age=86400" "gs://${BUCKET_NAME}/*.css" 2>/dev/null || true
gsutil -m setmeta -h "Cache-Control:public, max-age=86400" "gs://${BUCKET_NAME}/*.js" 2>/dev/null || true

echo "============================================================"
echo "✅ Deployment Complete!"
echo "   Public Website URL: https://storage.googleapis.com/${BUCKET_NAME}/index.html"
echo "   Or direct domain:   http://${BUCKET_NAME}/ (if custom DNS configured)"
echo "============================================================"
