@echo off
cd /d C:\Code\QueryBench
set CYPRESS_SKIP_VERIFY=true
set CYPRESS_CACHE_FOLDER=C:\Users\Omprakash.g\AppData\Local\Cypress\Cache
node node_modules\cypress\bin\cypress open
