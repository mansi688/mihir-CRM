#!/bin/bash
# (re)start the local Supabase stand-in API on :54321
cd "$(dirname "$0")"
[ -f server.pid ] && kill "$(cat server.pid)" 2>/dev/null && sleep 1
node --experimental-strip-types server.mjs ../.. > server.log 2>&1 &
echo $! > server.pid
for i in $(seq 1 30); do grep -q "stand-in on" server.log && break; grep -qi "error" server.log && break; sleep 0.5; done
tail -3 server.log
