#!/usr/bin/env bash
# B07 synthetic data only. Never point this exercise at a real or pre-existing user DB.
set -euo pipefail
source_db=jobs_mvp_migrate_20261123_restore_src
target_db=jobs_mvp_migrate_20261123_restore_dst
expected_url="mysql://b07_ci:b07_ci_only@127.0.0.1:3306/${source_db}"
if [[ "${DJS_B07_RESTORE_APPROVED:-}" != "DISPOSABLE_ONLY" ||
      "${INTEGRATION_TEST_DATABASE:-}" != "true" ||
      "${NODE_ENV:-}" == "production" ||
      "${DATABASE_URL:-}" != "$expected_url" ||
      "${B07_DISPOSABLE_RESTORE_DEST:-}" != "$target_db" ]]; then
  echo "B07 disposable restore refused: explicit CI target/approval required" >&2
  exit 2
fi

# The Docker image supplies the MySQL client matching the disposable MySQL 8 CI service.
# Credentials below only exist inside the isolated GitHub Actions service.
mysql_cli() {
  docker run --rm --network host -i -e MYSQL_PWD=b07_ci_only mysql:8.0 \
    mysql --protocol=tcp -h127.0.0.1 -P3306 -uroot "$@"
}
mysql_dump() {
  docker run --rm --network host -e MYSQL_PWD=b07_ci_only mysql:8.0 \
    mysqldump --protocol=tcp -h127.0.0.1 -P3306 -uroot \
      --single-transaction --skip-lock-tables --no-tablespaces \
      --set-gtid-purged=OFF --hex-blob "$source_db"
}
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# The destination must not already exist: no overwrite, reset or drop permitted.
exists="$(mysql_cli -N -B -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$target_db'")"
if [[ "$exists" != "0" ]]; then
  echo "B07 disposable restore refused: destination exists" >&2
  exit 2
fi
# Source schema is the one Prisma migrated in this same ephemeral CI job.
mysql_cli -D "$source_db" <<'SQL'
INSERT INTO User (id,email,passwordHash,role,createdAt)
 VALUES ('b07_fixture_user','b07-fixture@example.invalid','not-a-real-password-hash','USER',UTC_TIMESTAMP());
INSERT INTO ToolOrder (id,userId,sku,amountFen,credits,provider,status,refundHold,createdAt)
 VALUES ('b07_fixture_order','b07_fixture_user','STARTER20',990,20,'MOCK','PAID',FALSE,UTC_TIMESTAMP());
INSERT INTO ToolGrant (id,userId,orderId,total,remaining,createdAt)
 VALUES ('b07_fixture_grant','b07_fixture_user','b07_fixture_order',20,19,UTC_TIMESTAMP());
INSERT INTO ToolRun (id,userId,grantId,requestId,kind,status,createdAt)
 VALUES ('b07_fixture_run','b07_fixture_user','b07_fixture_grant','b07_fixture_req','RESUME_TEST','RESERVED',UTC_TIMESTAMP());
SQL

snapshot_checksum() {
  mysql_cli -N -B -D "$1" -e "
    SELECT id,email,role FROM User WHERE id='b07_fixture_user' ORDER BY id;
    SELECT id,userId,sku,amountFen,credits,provider,status,refundHold FROM ToolOrder WHERE id='b07_fixture_order' ORDER BY id;
    SELECT id,userId,orderId,total,remaining FROM ToolGrant WHERE id='b07_fixture_grant' ORDER BY id;
    SELECT id,userId,grantId,requestId,kind,status FROM ToolRun WHERE id='b07_fixture_run' ORDER BY id;
    SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  " | sha256sum | cut -d' ' -f1
}
expected="$(snapshot_checksum "$source_db")"
# Require a genuinely nonempty relational fixture, not just a successful empty schema dump.
source_counts="$(mysql_cli -N -B -D "$source_db" -e "SELECT (SELECT COUNT(*) FROM User WHERE id='b07_fixture_user'),(SELECT COUNT(*) FROM ToolOrder WHERE id='b07_fixture_order'),(SELECT COUNT(*) FROM ToolGrant WHERE id='b07_fixture_grant'),(SELECT COUNT(*) FROM ToolRun WHERE id='b07_fixture_run')")"
if [[ "$source_counts" != $'1\t1\t1\t1' ]]; then
  echo "B07 restore refused: nonempty source fixture incomplete" >&2
  exit 2
fi
mysql_dump > "$tmpdir/fixture-backup.sql"
if [[ ! -s "$tmpdir/fixture-backup.sql" ]]; then
  echo "B07 restore refused: empty backup" >&2
  exit 2
fi
mysql_cli -e "CREATE DATABASE \`$target_db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
restore_started="$(date +%s)"
mysql_cli -D "$target_db" < "$tmpdir/fixture-backup.sql"
restore_seconds="$(( $(date +%s) - restore_started ))"
actual="$(snapshot_checksum "$target_db")"
restored_counts="$(mysql_cli -N -B -D "$target_db" -e "SELECT (SELECT COUNT(*) FROM User WHERE id='b07_fixture_user'),(SELECT COUNT(*) FROM ToolOrder WHERE id='b07_fixture_order'),(SELECT COUNT(*) FROM ToolGrant WHERE id='b07_fixture_grant'),(SELECT COUNT(*) FROM ToolRun WHERE id='b07_fixture_run')")"
if [[ "$expected" != "$actual" || "$restored_counts" != "$source_counts" ]]; then
  echo "B07 restore FAILED: synthetic fixture checksum/count mismatch" >&2
  exit 2
fi
printf 'B07_DISPOSABLE_NONEMPTY_RESTORE status=PASS fixtures=4 sourceDb=%s targetDb=%s restoreSeconds=%s\n' "$source_db" "$target_db" "$restore_seconds"
printf 'B07_LIMITATIONS synthetic disposable only; restoreSeconds is CI-only, NOT production RTO/RPO\n'
