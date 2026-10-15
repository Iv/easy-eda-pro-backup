# Project Backup

Automatic daily backup of **all your EasyEDA Pro online projects** to your local disk: your personal space, every team you belong to, and the projects inside team folders.

## What you get

Each run writes **one zip archive per day** into your backup folder:

```
EasyEDA-backup_2026-10-15.zip
├── backup-log.txt                     ← every project, OK / FAIL and the reason
├── Personal/my-board.epro2
├── my-team/motor-driver.epro2
└── my-team/some-folder/sensor.epro2
```

- Projects are exported in the **`.epro2`** format. For projects that the server still stores in the older format, an `.epro` export contains only `project.json`, with no schematics or PCBs. The `.epro2` export is complete.
- Each export is **checked**. A file without any project data is reported as **FAIL**, never silently saved as OK.
- If two projects have the same name in the same place, a short ID is added to the file name.

## First-time setup

1. In **Extension Manager**, open this extension and enable **"Allow external interaction"**. The extension needs it to write files to disk. Without it every backup fails.
2. Open **Advanced → Backup → Set backup folder…** and enter the absolute path of an **existing** folder, for example `/home/me/Dropbox/EasyEDA-backups` or `D:\Backups\EasyEDA`.
   - The extension cannot create folders, so create the folder first.
   - If you skip this step, the default is `<Documents>/EasyEDA-Pro-backups`. If that folder doesn't exist, archives go to `<Documents>` itself.
   - A folder synced to a cloud drive (Dropbox, Google Drive, OneDrive, Yandex.Disk…) gives you an off-site copy for free.
3. Run **Advanced → Backup → Backup all projects now** once. A progress bar shows `Backup 7/31: <project>`. When it finishes, check **Last backup status**.

> Tip: to get a separate **Backup** menu in the top bar instead of the one under **Advanced**, enable "show in header menu" for this extension in Extension Manager.

## When it runs

- **Automatically, once a day.** About 2 minutes after you log in, and then every hour, the extension checks whether today's backup exists. If it doesn't, the backup runs. No progress bar is shown, so it doesn't interrupt your work; you only get a notification at the start and at the end.
- **Manually** with **Backup all projects now**, as often as you like. A later run on the same day overwrites that day's archive.
- **Only while the EasyEDA Pro desktop client is open, logged in, and in Online mode.** It does not run in the browser version or in Offline / Half-Offline mode.

A backup of about 30 projects takes 1–3 minutes. Each project is downloaded from the server.

## Menu

| Item | What it does |
|---|---|
| Backup all projects now | Starts a full backup immediately, with a progress bar |
| Last backup status | Time of the last run, how many projects succeeded or failed, the first error, and where the archive was written |
| Set backup folder… | Changes the backup folder. Leave the field empty to restore the default |

## Restoring a project

Unzip the archive and open or import the `.epro2` file in EasyEDA Pro (**File → Open** or **File → Import**). This creates a project from the backup. Your online project is not touched.

## Old backups

The extension **never deletes anything**, so archives pile up (one per day). Clean them up yourself, or use the prune script from the project repository. It keeps 30 days of daily backups plus one archive per month.

## Requirements and limits

- EasyEDA Pro **desktop client** 3.2 or newer.
- The **"Download project"** permission in each team. Without it, that team's projects fail and are listed in `backup-log.txt`.
- Only online projects are backed up. Local offline projects (`.eprj` files) already live on your disk.
- The exported project-file API is marked *beta* by EasyEDA, so a client update may change its behaviour. Check **Last backup status** now and then.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Every project FAILs, or "cannot write … does the folder exist?" | Enable "Allow external interaction" and make sure the backup folder exists |
| "Backup skipped: EasyEDA is not in online mode" | Switch the client to Online mode and log in |
| Some projects FAIL with a permission error | Ask the team owner for the "Download project" permission |
| No Backup menu | Look under **Advanced → Backup**, or restart EasyEDA after installing |

## Privacy

Everything stays on your machine. The extension uses only the official EasyEDA Pro extension API. It sends no data anywhere and never asks for credentials.

---

Source code, issues and the prune script: https://github.com/Iv/easy-eda-pro-backup · MIT License · © 2026 Ivan Kravchenko
