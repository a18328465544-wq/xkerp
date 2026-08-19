#!/usr/bin/env bash
# PostgreSQL 逻辑备份：由 cron 每日执行，也可手动运行。
# 备份采用 pg_dump custom 格式；完成后会用 pg_restore 校验，再原子移动到备份目录。
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/../gpu-erp-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[backup] 无法读取环境文件: ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup] DATABASE_URL 未配置" >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "[backup] 未安装 pg_dump" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "[backup] 未安装 pg_restore" >&2; exit 1; }
command -v flock >/dev/null || { echo "[backup] 未安装 flock" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
exec 9>"${BACKUP_DIR}/.pg_backup.lock"
flock -n 9 || { echo "[backup] 已有备份任务在运行，跳过本次执行" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
FINAL_FILE="${BACKUP_DIR}/gpu_erp_${STAMP}.dump"
TEMP_FILE="${BACKUP_DIR}/.${STAMP}.$$.partial"

cleanup() {
  rm -f "${TEMP_FILE}"
}
trap cleanup EXIT

pg_dump --dbname="${DATABASE_URL}" --format=custom --no-owner --no-privileges --file="${TEMP_FILE}"
pg_restore --list "${TEMP_FILE}" >/dev/null
mv "${TEMP_FILE}" "${FINAL_FILE}"

# 仅清理由本脚本产生且超过保留期的备份，不碰旧格式的历史备份。
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'gpu_erp_*.dump' -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] 成功: ${FINAL_FILE} ($(du -h "${FINAL_FILE}" | awk '{print $1}'))"
