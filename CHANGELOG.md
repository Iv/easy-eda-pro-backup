# Changelog

## 1.6.0
- Each project download is retried up to 3 times (after 2 s and 5 s).
- After 4 network errors in a row the run stops early instead of failing every project slowly.
- A run that saved nothing writes `EasyEDA-backup_<date>_FAILED.zip` (log only) and never overwrites a good archive from the same day.
- If some projects failed, the automatic backup runs again an hour later, up to 3 runs a day.
- Prune script: `…_FAILED.zip` files are never kept as monthly copies and expire after 30 days.

## 1.5.0
- The extension details page in Extension Manager now shows a full description and this changelog.

## 1.4.0
- Projects are exported as **.epro2**. The .epro export of projects stored in the older server format contained only `project.json`, with no schematics or PCBs.
- Every export is checked for project data. Empty exports are reported as FAIL.
- Log timestamps use local time.

## 1.3.0
- A progress bar (`Backup N/total: project`) is shown during manual backups.

## 1.2.0
- One zip archive per day (`EasyEDA-backup_YYYY-MM-DD.zip`) instead of dated folders, because the extension API cannot create folders.
- **Last backup status** shows the first error and where the archive was written.

## 1.1.0
- Backup folder can be set from the menu (**Set backup folder…**). The default is `<Documents>/EasyEDA-Pro-backups`.

## 1.0.0
- First version: daily and manual backup of all personal and team projects.
