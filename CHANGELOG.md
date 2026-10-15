# Changelog

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
