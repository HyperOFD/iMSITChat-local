#!/bin/sh
set -eu
umask 077
if [ ! -s "$POSTGRES_PASSWORD_FILE" ]; then
  head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$POSTGRES_PASSWORD_FILE.tmp"
  mv "$POSTGRES_PASSWORD_FILE.tmp" "$POSTGRES_PASSWORD_FILE"
fi
# The backend reads the file through a read-only credentials volume.
chmod 0444 "$POSTGRES_PASSWORD_FILE"
exec docker-entrypoint.sh postgres
