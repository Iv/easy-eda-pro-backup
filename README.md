# Project Backup for EasyEDA Pro

*[Русская версия ниже](#русский)*

An EasyEDA Pro extension that backs up **all your online projects**: your personal space, every team you belong to, and the projects inside team folders. Each project is saved as an `.epro` file on your local disk once a day, or whenever you start a backup from the menu.

```
<backup folder>/
  2026-10-15/
    backup-log.txt              ← what was saved, what failed and why
    My Name/my-board.epro
    my-team/motor-driver.epro
    other-team/some-folder/sensor-board.epro
  2026-10-16/
    ...
```

## Install

1. In EasyEDA Pro, go to **Settings → Extensions → Extension Manager → Import** and pick `project-backup_v1.1.0.eext`.
2. In the extension's card, turn on **"Allow external interaction"**. Without it the extension cannot write files.
3. Restart EasyEDA Pro.
4. Optional: open **Backup → Set backup folder…** and choose a folder. The default is `<Documents>/EasyEDA-Pro-backups`. A folder synced to Yandex.Disk, Dropbox or Google Drive gives you an off-site copy for free.
5. Run **Backup → Backup all projects now** once and check `backup-log.txt`.

## How it works

- It uses only the official EasyEDA Pro extension API (`eda.dmt_Team`, `eda.dmt_Folder`, `eda.dmt_Project`, `eda.sys_FileManager.getProjectFileByProjectUuid`, `eda.sys_FileSystem`). There is no reverse engineering and it never asks for credentials.
- **Automatic run.** About 2 minutes after you log in, and then every hour, the extension checks whether today's backup exists. If it doesn't, the backup runs. So you get at most one automatic backup per day, and only while the EasyEDA Pro desktop client is open in **Online** mode.
- **Manual run.** Top menu **Backup → Backup all projects now**.
- **Status.** **Backup → Last backup status** shows the time of the last run, the ok/failed counts and the backup folder.
- **Deleting old backups.** The extension never deletes anything. Use `easyeda-backup-prune.sh` (below) or your own cleanup job.

## Requirements

- EasyEDA Pro desktop client 3.2 or newer (tested on 3.2.206, Linux), logged in, in Online mode.
- The **"Download project"** permission in each team. Without it, that team's projects fail and are listed in `backup-log.txt`.

## Pruning old backups (Linux, optional)

`easyeda-backup-prune.sh` keeps every daily backup from the last 30 days, plus the earliest backup of each month forever. It only touches folders named `YYYY-MM-DD`.

```bash
install -m755 easyeda-backup-prune.sh ~/.local/bin/
# Optional: test it first without deleting anything
EASYEDA_BACKUP_ROOT=~/Documents/EasyEDA-Pro-backups DRY_RUN=1 ~/.local/bin/easyeda-backup-prune.sh
```

Run it every day with a systemd user timer. If your backup folder is not `~/Yandex.Disk/Backups/EasyEDA`, add `Environment=EASYEDA_BACKUP_ROOT=/your/path` to the `[Service]` section.

```ini
# ~/.config/systemd/user/easyeda-backup-prune.service
[Unit]
Description=Prune old EasyEDA project backups
[Service]
Type=oneshot
ExecStart=%h/.local/bin/easyeda-backup-prune.sh

# ~/.config/systemd/user/easyeda-backup-prune.timer
[Unit]
Description=Daily prune of old EasyEDA project backups
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```

```bash
systemctl --user enable --now easyeda-backup-prune.timer
```

Settings (environment variables): `EASYEDA_BACKUP_ROOT` (default `~/Yandex.Disk/Backups/EasyEDA`; set it to your backup folder), `KEEP_DAYS` (default 30), `DRY_RUN=1`.

## Troubleshooting

- **No "Backup" menu, or nothing happens.** Make sure the extension is enabled and "Allow external interaction" is on, then restart EasyEDA Pro.
- **"Backup skipped: EasyEDA is not in online mode".** Switch the client to Online mode. On Linux, if the client keeps falling back to Full Offline after a restart, its startup network check is timing out. Start it with `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`.
- **Errors like `cannot write ...` in the log.** Check that the backup folder exists and that you can write to it.

## Build

The extension needs no build step. The package is a zip archive of `extension.json` and `dist/index.js`:

```bash
./build.sh   # → project-backup_v<version>.eext
```

---

## Русский

Расширение для EasyEDA Pro, которое делает резервные копии **всех онлайн-проектов**: из личного пространства, из всех ваших команд и из папок внутри команд. Каждый проект сохраняется на локальный диск в файл `.epro` раз в сутки или по команде из меню.

**Установка**

1. В EasyEDA Pro откройте **Settings → Extensions → Extension Manager → Import** и выберите `project-backup_v1.1.0.eext`.
2. В карточке расширения включите **«Allow external interaction»**. Без этого расширение не сможет записывать файлы.
3. Перезапустите EasyEDA Pro.
4. При желании выберите папку для бэкапов: **Backup → Set backup folder…**. По умолчанию это `<Documents>/EasyEDA-Pro-backups`. Если выбрать папку, которая синхронизируется с Яндекс.Диском или Dropbox, копия будет храниться ещё и в облаке.
5. Один раз запустите **Backup → Backup all projects now** и проверьте `backup-log.txt`.

**Как работает**

- **Автоматически.** Примерно через 2 минуты после входа в аккаунт, а затем каждый час расширение проверяет, есть ли бэкап за сегодня. Если нет — запускает его. Получается не больше одного автоматического бэкапа в день, и только пока EasyEDA Pro открыт в режиме Online.
- **Вручную.** Меню **Backup → Backup all projects now**.
- **Статус.** **Backup → Last backup status** показывает время последнего запуска, число успешных и неудачных проектов и папку с бэкапами.
- **Старые копии.** Расширение ничего не удаляет. Для очистки есть скрипт `easyeda-backup-prune.sh`: он хранит все бэкапы за 30 дней, а из более старых — самый ранний бэкап каждого месяца. Как включить его через systemd-таймер, описано выше.

**Требования.** Десктопный клиент EasyEDA Pro 3.2 или новее, вход в аккаунт, режим Online. В каждой команде нужно право **«Скачивание проекта»**. Проекты из команд, где его нет, попадут в лог как ошибки.

**Если клиент после перезапуска всегда в Full Offline (Linux).** Не проходит сетевая проверка при старте клиента. Запускайте его с переменной `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`.

## License

MIT — see [LICENSE](LICENSE).
