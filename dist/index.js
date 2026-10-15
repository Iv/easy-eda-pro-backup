/**
 * Project Backup — EasyEDA Pro extension
 *
 * Backs up ALL online projects you have access to (personal space and every team,
 * including projects inside folders) as .epro files on the local disk.
 *
 * Layout:
 *   <backup folder>/<YYYY-MM-DD>/<team>/<folder>/<project>.epro
 *   <backup folder>/<YYYY-MM-DD>/backup-log.txt   — what was saved / what failed and why
 *
 * When it runs:
 *   - automatically once a day: ~2 min after you log in, then the extension checks
 *     hourly whether today's backup exists (only while EasyEDA Pro is open in Online mode);
 *   - manually: top menu "Backup → Backup all projects now".
 *
 * Settings (top menu "Backup"):
 *   - "Set backup folder…" — default is <Documents>/EasyEDA-Pro-backups;
 *   - "Last backup status" — result of the last run.
 *
 * Requirements:
 *   - EasyEDA Pro desktop client 3.2+ in Online mode, logged in;
 *   - "Allow external interaction" enabled for this extension in Extension Manager
 *     (needed to write files to disk);
 *   - "Download project" permission in each team (otherwise that team's projects fail
 *     and are listed in backup-log.txt).
 *
 * The extension never deletes anything. To prune old backups use an external job,
 * e.g. the easyeda-backup-prune.sh script shipped alongside (keeps 30 days + one per month).
 */
"use strict";
var edaEsbuildExportName = (() => {
	// Default backup folder name inside the user's Documents folder
	const DEFAULT_FOLDER_NAME = 'EasyEDA-Pro-backups';
	// How often to check whether today's backup is done (ms)
	const CHECK_INTERVAL = 60 * 60 * 1000;
	// Delay after login before the first check, so the editor finishes loading (ms)
	const STARTUP_DELAY = 2 * 60 * 1000;

	let running = false;

	async function getBackupRoot() {
		const custom = eda.sys_Storage.getExtensionUserConfig('backupRoot');
		if (custom) return String(custom).replace(/[\/\\]+$/, '');
		return (await eda.sys_FileSystem.getDocumentsPath()) + '/' + DEFAULT_FOLDER_NAME;
	}

	function today() {
		const d = new Date();
		const p = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	function now() {
		return new Date().toISOString().replace('T', ' ').slice(0, 19);
	}

	function safe(name) {
		return String(name || 'unnamed').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').trim() || 'unnamed';
	}

	function toast(msg, type) {
		try {
			eda.sys_Message.showToastMessage(msg, type);
		} catch (e) {
			console.log('[backup]', msg);
		}
	}

	async function getTeams() {
		let teams = [];
		try {
			teams = (await eda.dmt_Team.getAllInvolvedTeamInfo()) || [];
		} catch (e) {}
		if (!teams.length) {
			try {
				teams = (await eda.dmt_Team.getAllTeamsInfo()) || [];
			} catch (e) {}
		}
		return teams;
	}

	// Returns Map<projectUuid, {team, folderPath}>
	async function collectProjects(log) {
		const result = new Map();
		const add = (uuids, team, folderPath) => {
			for (const u of uuids || []) {
				if (!result.has(u)) result.set(u, { team, folderPath });
			}
		};

		const teams = await getTeams();
		log.push(`Teams found: ${teams.map((t) => t.name).join(', ') || '(none)'}`);

		for (const team of teams) {
			try {
				add(await eda.dmt_Project.getAllProjectsUuid(team.uuid), team.name, '');
			} catch (e) {
				log.push(`! list projects of team "${team.name}": ${e && e.message}`);
			}
			let folders = [];
			try {
				folders = (await eda.dmt_Folder.getAllFoldersUuid(team.uuid)) || [];
			} catch (e) {
				log.push(`! list folders of team "${team.name}": ${e && e.message}`);
			}
			const folderInfo = new Map();
			for (const f of folders) {
				try {
					folderInfo.set(f, await eda.dmt_Folder.getFolderInfo(team.uuid, f));
				} catch (e) {}
			}
			const folderPath = (f, depth = 0) => {
				const info = folderInfo.get(f);
				if (!info || depth > 20) return '';
				const parent = info.parentFolderUuid && folderInfo.has(info.parentFolderUuid) ? folderPath(info.parentFolderUuid, depth + 1) + '/' : '';
				return parent + safe(info.name);
			};
			for (const f of folders) {
				try {
					const uuids = await eda.dmt_Project.getAllProjectsUuid(undefined, f);
					// Projects inside folders take the folder path even if already seen at team level
					for (const u of uuids || []) result.set(u, { team: team.name, folderPath: folderPath(f) });
				} catch (e) {
					log.push(`! list projects of folder ${f}: ${e && e.message}`);
				}
			}
		}
		return result;
	}

	async function save(dir, blob, fileName) {
		try {
			if (await eda.sys_FileSystem.saveFileToFileSystem(dir + '/', blob, fileName, true)) return true;
		} catch (e) {}
		return false;
	}

	async function runBackup(manual) {
		if (running) {
			if (manual) toast('Backup is already running');
			return;
		}
		running = true;
		const date = today();
		let dayDir = '';
		const log = [`EasyEDA project backup ${now()}`];
		let ok = 0;
		const failed = [];
		try {
			if (!eda.sys_Environment.isOnlineMode()) {
				log.push('Client is not in online mode, skipped');
				if (manual) toast('Backup skipped: EasyEDA is not in online mode', 'warn');
				return;
			}
			dayDir = `${await getBackupRoot()}/${date}`;
			log.push(`Target: ${dayDir}`);
			toast('Project backup started…');
			const projects = await collectProjects(log);
			log.push(`Projects found: ${projects.size}`, '');

			for (const [uuid, meta] of projects) {
				let name = uuid;
				try {
					const info = await eda.dmt_Project.getProjectInfo(uuid);
					if (info && info.friendlyName) name = info.friendlyName;
				} catch (e) {}
				const dir = [dayDir, safe(meta.team), meta.folderPath].filter(Boolean).join('/');
				try {
					const file = await eda.sys_FileManager.getProjectFileByProjectUuid(uuid, safe(name), undefined, 'epro');
					if (!file) throw new Error('empty file returned');
					const fileName = safe(name) + '.epro';
					if (!(await save(dir, file, fileName))) throw new Error('cannot write ' + dir + '/' + fileName);
					ok++;
					log.push(`OK   ${meta.team}/${meta.folderPath ? meta.folderPath + '/' : ''}${name}  (${file.size} bytes)`);
				} catch (e) {
					failed.push(name);
					log.push(`FAIL ${meta.team}/${meta.folderPath ? meta.folderPath + '/' : ''}${name}  [${uuid}]: ${e && e.message}`);
				}
			}
			log.push('', `Done ${now()}: ${ok} ok, ${failed.length} failed`);
			if (ok > 0) await eda.sys_Storage.setExtensionUserConfig('lastBackupDate', date);
			await eda.sys_Storage.setExtensionUserConfig('lastBackupSummary', `${now()}: ${ok} ok, ${failed.length} failed${failed.length ? ' (' + failed.join(', ') + ')' : ''}`);
			toast(
				`Backup finished: ${ok} projects saved` + (failed.length ? `, ${failed.length} failed` : ''),
				failed.length ? 'warn' : 'success',
			);
		} catch (e) {
			log.push(`Backup crashed: ${e && e.stack ? e.stack : e}`);
			toast('Backup failed: ' + (e && e.message), 'error');
		} finally {
			if (dayDir) await save(dayDir, new Blob([log.join('\n') + '\n'], { type: 'text/plain' }), 'backup-log.txt');
			running = false;
		}
	}

	async function checkAndRun() {
		try {
			if (eda.sys_Storage.getExtensionUserConfig('lastBackupDate') !== today()) await runBackup(false);
		} catch (e) {
			console.log('[backup] check failed', e);
		}
	}

	function activate(status, arg) {
		eda.sys_Timer.setTimeoutTimer('projectBackupStartup', STARTUP_DELAY, checkAndRun);
		eda.sys_Timer.setIntervalTimer('projectBackupDaily', CHECK_INTERVAL, checkAndRun);
	}

	async function backupNow() {
		await runBackup(true);
	}

	async function backupStatus() {
		const s = eda.sys_Storage.getExtensionUserConfig('lastBackupSummary') || 'No backup has run yet';
		let root = '(unknown — enable "Allow external interaction")';
		try {
			root = await getBackupRoot();
		} catch (e) {}
		eda.sys_Dialog.showInformationMessage(`${s}\n\nFolder: ${root}`, 'Project Backup');
	}

	async function setBackupFolder() {
		let current = '';
		try {
			current = await getBackupRoot();
		} catch (e) {}
		eda.sys_Dialog.showInputDialog(
			'Absolute path of the backup folder (empty = default <Documents>/' + DEFAULT_FOLDER_NAME + '):',
			undefined,
			'Project Backup',
			'text',
			current,
			undefined,
			async (value) => {
				if (value === undefined || value === null) return;
				const v = String(value).trim();
				await eda.sys_Storage.setExtensionUserConfig('backupRoot', v || undefined);
				toast('Backup folder: ' + (await getBackupRoot()), 'success');
			},
		);
	}

	return { activate, backupNow, backupStatus, setBackupFolder };
})();
