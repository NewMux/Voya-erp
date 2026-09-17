#!/bin/sh
set -e

# Apply pending migrations before the server accepts traffic.
#
# `migrate deploy` only applies migrations that are already committed — it never
# generates one and never resets data, so it is safe to run on every boot.
# Running it here rather than as a separate Coolify step means a redeploy can
# never start a container against a schema it does not match.

echo "Applying database migrations..."
./node_modules/.bin/prisma migrate deploy

# Reference data only: staff logins, WhatsApp templates, company settings.
# Every write is an upsert that preserves existing values, so this never resets
# a changed password. Demo data is not reachable from here at all.
if [ "$RUN_SEED_ON_START" = "true" ]; then
  node ./prisma/seed-reference.mjs
fi

echo "Starting Voya ERP..."
exec "$@"
