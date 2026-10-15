# Project Backup for EasyEDA Pro

An EasyEDA Pro extension that backs up **all your online projects**: your personal space, every team you belong to, and the projects inside team folders. Each project is saved as an `.epro2` file, and once a day (or whenever you start a backup from the menu) they are all packed into one zip archive on your local disk.

```
<backup folder>/
  EasyEDA-backup_2026-10-15.zip
    backup-log.txt              ← what was saved, what failed and why
    My Name/my-board.epro2
    my-team/motor-driver.epro2
    other-team/some-folder/sensor-board.epro2
  EasyEDA-backup_2026-10-16.zip
  ...
```

One archive per day: the extension API can write files but cannot create folders.

**Why `.epro2`.** For projects still stored on the server in the older format, the `.epro` export contains only `project.json`, with no schematics or PCBs. In testing this hit 18 of 31 projects. The `.epro2` export is complete for all of them. Each export is checked, and an export without any project data is reported as **FAIL**, never as OK.

**Restoring.** Unzip the archive and open or import the `.epro2` file in EasyEDA Pro (**File → Open** / **Import**).

## Install

1. In EasyEDA Pro, go to **Settings → Extensions → Extension Manager → Import** and pick `project-backup_v1.5.0.eext`.
2. In the extension's card, turn on **"Allow external interaction"**. Without it the extension cannot write files.
3. Restart EasyEDA Pro.
4. Optional: open **Backup → Set backup folder…** and enter the path of an **existing** folder. The default is `<Documents>/EasyEDA-Pro-backups`; if that folder doesn't exist, archives go to `<Documents>` itself. A folder synced to Yandex.Disk, Dropbox or Google Drive gives you an off-site copy for free.
5. Run **Backup → Backup all projects now** once and check `backup-log.txt` inside the archive.

## How it works

- It uses only the official EasyEDA Pro extension API (`eda.dmt_Team`, `eda.dmt_Folder`, `eda.dmt_Project`, `eda.sys_FileManager.getProjectFileByProjectUuid`, `eda.sys_FileSystem`). There is no reverse engineering and it never asks for credentials.
- **Automatic run.** About 2 minutes after you log in, and then every hour, the extension checks whether today's backup exists. If it doesn't, the backup runs. So you get at most one automatic backup per day, and only while the EasyEDA Pro desktop client is open in **Online** mode.
- **Manual run.** Menu **Backup → Backup all projects now**. A progress bar shows `Backup 7/31: <project>`. Automatic runs don't show it, so they don't interrupt your work; you only get a toast at the start and at the end.
- **Status.** **Backup → Last backup status** shows the time of the last run, the ok/failed counts, the first error (if any) and where the archive was written.
- **Deleting old backups.** The extension never deletes anything. Use `easyeda-backup-prune.sh` (below) or your own cleanup job.

## Requirements

- EasyEDA Pro desktop client 3.2 or newer (tested on 3.2.206, Linux), logged in, in Online mode.
- The **"Download project"** permission in each team. Without it, that team's projects fail and are listed in `backup-log.txt`.

## Pruning old backups (Linux, optional)

`easyeda-backup-prune.sh` keeps every daily backup from the last 30 days, plus the earliest backup of each month forever. It only touches files named `EasyEDA-backup_YYYY-MM-DD.zip` (and legacy `YYYY-MM-DD` folders).

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
- **"Backup skipped: EasyEDA is not in online mode".** Switch the client to Online mode.
- **"cannot write … — does the folder exist?" in Last backup status.** The backup folder must already exist (the extension cannot create folders). Create it, or pick another one with **Set backup folder…**.
- **Where is the menu?** By default EasyEDA puts extension menus under **Advanced → Backup**. To get a separate top-level **Backup** menu, enable "show in header menu" in the extension's card in Extension Manager.

## Build

The extension needs no build step. The package is a zip archive of `extension.json`, `dist/index.js`, `README.md` (taken from `docs/EXTENSION_README.md` and shown on the extension's details page in Extension Manager), `CHANGELOG.md` and `LICENSE`:

```bash
./build.sh   # → project-backup_v<version>.eext
```


## License

MIT — see [LICENSE](LICENSE).
