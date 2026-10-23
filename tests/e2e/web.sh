#!/bin/bash
# build the app against the local API and serve it on :4173
cd "$(dirname "$0")"
K=$(node -e "console.log(require('./keys.json').ANON_KEY)")
(cd ../.. && VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=$K npx vite build --outDir tests/e2e/dist --emptyOutDir 2>&1 | grep -E "rror|built")
[ -f web.pid ] && kill "$(cat web.pid)" 2>/dev/null && sleep 0.5
node static.mjs "$PWD/dist" 4173 > web.log 2>&1 &
echo $! > web.pid
sleep 1; cat web.log
