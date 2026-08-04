# deploy-to-render.ps1
# Fully automated ELD Trip Planner backend deployment to Render
# Uses the Render REST API directly

param(
    [string]$ApiKey        = "rnd_QGR7YmiLycdJy1XQN0ZoMFt0Lvpw",
    [string]$OrsKey        = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjJlMWI5YWMzYjdlNDRjMWQ5NjY1NDUwMzk2ODY1OGY4IiwiaCI6Im11cm11cjY0In0=",
    [string]$DjangoSecret  = "zGI03q9Uk2_BYzw7mTsrFVXyGIWuCLTS1r30hIdkXtePVjq65w9Xsaw--O08bnWqBHI",
    [string]$Region        = "oregon"
)

$ErrorActionPreference = "Stop"

$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Accept"        = "application/json"
    "Content-Type"  = "application/json"
}

function Invoke-Render {
    param(
        [string]$Method,
        [string]$Path,
        $Body = $null
    )
    $url = "https://api.render.com/v1" + $Path
    $splat = @{
        Method          = $Method
        Uri             = $url
        Headers         = $headers
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $splat.Body = ($Body | ConvertTo-Json -Depth 12)
    }
    $resp = Invoke-WebRequest @splat
    return ($resp.Content | ConvertFrom-Json)
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ELD Trip Planner  -  Render Deployment  " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get owner ID
Write-Host "[1/5] Fetching workspace info..." -ForegroundColor Yellow
$owners  = Invoke-Render -Method GET -Path "/owners?limit=1"
$ownerId = $owners[0].owner.id
$ownerName = $owners[0].owner.name
Write-Host "      Workspace: $ownerName  (id: $ownerId)" -ForegroundColor Green

# Step 2: Create PostgreSQL database (idempotent)
Write-Host "[2/5] Creating PostgreSQL database 'eldtrip-db'..." -ForegroundColor Yellow

$existingDbs = Invoke-Render -Method GET -Path "/postgres?limit=20"
$existingDb  = $existingDbs | Where-Object { $_.postgres.name -eq "eldtrip-db" } | Select-Object -First 1

if ($existingDb) {
    $dbId = $existingDb.postgres.id
    Write-Host "      DB already exists (id: $dbId) - skipping." -ForegroundColor Green
} else {
    $dbBody = [ordered]@{
        databaseName = "eldtrip"
        name         = "eldtrip-db"
        ownerId      = $ownerId
        plan         = "free"
        region       = $Region
        user         = "eldtrip"
        version      = "16"
    }
    $dbResp = Invoke-Render -Method POST -Path "/postgres" -Body $dbBody
    $dbId   = $dbResp.id
    Write-Host "      Database created! id: $dbId" -ForegroundColor Green
    Write-Host "      Waiting 20s for DB to initialize..." -ForegroundColor Gray
    Start-Sleep -Seconds 20
}

# Step 3: Fetch DB connection string
Write-Host "[3/5] Fetching database connection string..." -ForegroundColor Yellow
$dbConnInfo = Invoke-Render -Method GET -Path "/postgres/$dbId/connection-info"
$dbConnStr = $dbConnInfo.internalConnectionString
if (-not $dbConnStr) {
    $dbConnStr = $dbConnInfo.externalConnectionString
}
Write-Host "      Got connection string." -ForegroundColor Green

# Step 4: Create Web Service (idempotent)
Write-Host "[4/5] Creating Web Service 'eldtrip-backend'..." -ForegroundColor Yellow

$existingSvcs = Invoke-Render -Method GET -Path "/services?limit=20"
$existingWeb  = $existingSvcs | Where-Object { $_.service.name -eq "eldtrip-backend" } | Select-Object -First 1

$startCmd = "python manage.py collectstatic --noinput && python manage.py migrate && gunicorn eldtrip.wsgi:application --bind 0.0.0.0:`$PORT"

if ($existingWeb) {
    $svcId = $existingWeb.service.id
    Write-Host "      Service already exists (id: $svcId) - updating DATABASE_URL env var..." -ForegroundColor Green
    $envUpdateJson = "[{`"key`":`"DATABASE_URL`",`"value`":`"$dbConnStr`"}]"
    Invoke-WebRequest -Method PUT -Uri "https://api.render.com/v1/services/$svcId/env-vars" -Headers $headers -Body $envUpdateJson | Out-Null
    Write-Host "      Triggering redeploy..." -ForegroundColor Green
    $redeployBody = [ordered]@{ clearCache = "do_not_clear" }
    Invoke-Render -Method POST -Path "/services/$svcId/deploys" -Body $redeployBody | Out-Null
} else {
    $envVars = @(
        [ordered]@{ key = "DATABASE_URL";             value = $dbConnStr },
        [ordered]@{ key = "DJANGO_SECRET_KEY";        value = $DjangoSecret },
        [ordered]@{ key = "DJANGO_DEBUG";             value = "0" },
        [ordered]@{ key = "DJANGO_ALLOWED_HOSTS";     value = "eldtrip-backend.onrender.com" },
        [ordered]@{ key = "OPENROUTESERVICE_API_KEY"; value = $OrsKey },
        [ordered]@{ key = "CORS_ALLOW_ALL_ORIGINS";   value = "1" }
    )

    $svcBody = [ordered]@{
        autoDeploy = "yes"
        branch     = "main"
        name       = "eldtrip-backend"
        ownerId    = $ownerId
        region     = $Region
        repo       = "https://github.com/jasilkp/ELD_Triptracker"
        type       = "web_service"
        serviceDetails = [ordered]@{
            env          = "python"
            rootDir      = "backend"
            numInstances = 1
            plan         = "free"
            region       = $Region
            envSpecificDetails = [ordered]@{
                pythonVersion = "3.12.9"
                buildCommand = "pip install -r requirements.txt"
                startCommand = $startCmd
            }
        }
        envVars      = $envVars
    }

    $svcResp = Invoke-Render -Method POST -Path "/services" -Body $svcBody
    $svcId   = $svcResp.service.id
    Write-Host "      Web service created! id: $svcId" -ForegroundColor Green
}

# Step 5: Summary
Write-Host ""
Write-Host "[5/5] Deployment triggered!" -ForegroundColor Green
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Deployment Summary" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Backend URL : https://eldtrip-backend.onrender.com" -ForegroundColor White
Write-Host "  Dashboard   : https://dashboard.render.com" -ForegroundColor White
Write-Host "  API Health  : https://eldtrip-backend.onrender.com/api/trip/" -ForegroundColor White
Write-Host ""
Write-Host "  NOTE: First deploy takes ~5-10 min. Watch logs at:" -ForegroundColor Yellow
Write-Host "  https://dashboard.render.com" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Once live, update frontend/.env:" -ForegroundColor Cyan
Write-Host "  VITE_API_BASE_URL=https://eldtrip-backend.onrender.com" -ForegroundColor White
Write-Host ""
