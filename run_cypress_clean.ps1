# Run Cypress E2E tests in a clean environment
# Usage:
#   .\run_cypress_clean.ps1              — run all specs (admin_e2e then participant_e2e)
#   .\run_cypress_clean.ps1 admin        — run admin_e2e only
#   .\run_cypress_clean.ps1 participant  — run participant_e2e only

Set-Location 'C:\Code\QueryBench'

# Remove potentially interfering environment variables
Remove-Item Env:\NODE_OPTIONS -ErrorAction SilentlyContinue
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
Remove-Item Env:\ELECTRON_EXTRA_LAUNCH_ARGS -ErrorAction SilentlyContinue

$env:CYPRESS_SKIP_VERIFY = 'true'
$env:CYPRESS_CACHE_FOLDER = 'C:\Users\Omprakash.g\AppData\Local\Cypress\Cache'

# Resolve spec from optional argument
$specArg = switch ($args[0]) {
    'admin'       { "--spec 'cypress/e2e/admin_e2e.cy.js'" }
    'participant' { "--spec 'cypress/e2e/participant_e2e.cy.js'" }
    default       { '' }
}

$label = if ($specArg) { $args[0] } else { 'all' }
Write-Host "Running Cypress E2E ($label)..."

$exitCode = 0
if ($specArg) {
    & node 'node_modules\cypress\bin\cypress' run $specArg.Split(' ')
    $exitCode = $LASTEXITCODE
} else {
    # Run admin first so e2e_session.json is written before participant reads it
    & node 'node_modules\cypress\bin\cypress' run --spec 'cypress/e2e/admin_e2e.cy.js'
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
        & node 'node_modules\cypress\bin\cypress' run --spec 'cypress/e2e/participant_e2e.cy.js'
        $exitCode = $LASTEXITCODE
    } else {
        Write-Host "admin_e2e failed — skipping participant_e2e."
    }
}

Write-Host "Exit: $exitCode"
exit $exitCode
