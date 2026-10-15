#!/usr/bin/env bash
# Prune EasyEDA project backups (EasyEDA-backup_YYYY-MM-DD.zip, or legacy YYYY-MM-DD folders):
# keep every backup from the last KEEP_DAYS days, and the earliest backup of each month forever.
set -euo pipefail
ROOT="${EASYEDA_BACKUP_ROOT:-$HOME/Yandex.Disk/Backups/EasyEDA}"
KEEP_DAYS="${KEEP_DAYS:-30}"
DRY_RUN="${DRY_RUN:-0}"

[ -d "$ROOT" ] || exit 0
cutoff=$(date -d "-$KEEP_DAYS days" +%F)
declare -A month_first=()

# "<date> <name>" lines, sorted chronologically
mapfile -t entries < <(find "$ROOT" -mindepth 1 -maxdepth 1 -regextype posix-extended \
    \( -type f -regex '.*/EasyEDA-backup_[0-9]{4}-[0-9]{2}-[0-9]{2}\.zip' \
    -o -type d -regex '.*/[0-9]{4}-[0-9]{2}-[0-9]{2}' \) -printf '%f\n' |
    sed -E 's/^(EasyEDA-backup_)?([0-9]{4}-[0-9]{2}-[0-9]{2})(\.zip)?$/\2 &/' | sort)

for e in "${entries[@]}"; do
    d=${e%% *}
    m=${d:0:7}
    [ -n "${month_first[$m]:-}" ] || month_first[$m]=$d
done

for e in "${entries[@]}"; do
    d=${e%% *}
    name=${e#* }
    [[ "$d" < "$cutoff" ]] || continue
    [ "${month_first[${d:0:7}]}" = "$d" ] && continue
    if [ "$DRY_RUN" = 1 ]; then
        echo "would delete $ROOT/$name"
    else
        rm -rf -- "${ROOT:?}/$name"
        echo "deleted $ROOT/$name"
    fi
done
