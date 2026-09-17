#!/bin/bash
# Creates the auxiliary databases Postgres does not make on its own.
#
#   voya_erp_shadow — required by `prisma migrate dev` to diff migrations
#   voya_erp_test   — the test suite truncates every table, so it must not
#                     share a database with development data
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE voya_erp_shadow OWNER $POSTGRES_USER;
  CREATE DATABASE voya_erp_test OWNER $POSTGRES_USER;
EOSQL
