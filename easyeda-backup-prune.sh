#!/usr/bin/env bash
# Prune EasyEDA project backups: keep every daily backup from the last KEEP_DAYS days,
# and the earliest backup of each month forever.
set -euo pipefail
ROOT="${EASYEDA_BACKUP_ROOT:-$HOME/Yandex.Disk/Backups/EasyEDA}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DRY_RUN="${DRY_RUN:-0}"

[ -d "$ROOT" ] || exit 0
cutoff=$(date -d "-$KEEP_DAYS days" +%F)
declare -A month_first=()

# Backup folders are named YYYY-MM-DD, so lexical order is chronological
mapfile -t dirs < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}' -printf '%f\n' | sort)

for d in "${dirs[@]}"; do
    m=${d:0:7}
    [ -n "${month_first[$m]:-}" ] || month_first[$m]=$d
done

for d in "${dirs[@]}"; do
    [[ "$d" < "$cutoff" ]] || continue
    [ "${month_first[${d:0:7}]}" = "$d" ] && continue
    if [ "$DRY_RUN" = 1 ]; then
        echo "would delete $ROOT/$d"
    else
        rm -rf -- "${ROOT:?}/$d"
        echo "deleted $ROOT/$d"
    fi
done
