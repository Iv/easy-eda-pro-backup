/**
 * Project Backup — EasyEDA Pro extension
 *
 * Backs up ALL online projects you have access to (personal space and every team,
 * including projects inside folders) as .epro2 files on the local disk.
 *
 * Output: one archive per day
 *   <backup folder>/EasyEDA-backup_<YYYY-MM-DD>.zip
 *     <team>/<folder>/<project>.epro2
 *     backup-log.txt   — what was saved / what failed and why
 * A run that saved nothing writes EasyEDA-backup_<YYYY-MM-DD>_FAILED.zip (log only), so it
 * never overwrites a good archive. Each project download is retried up to 3 times.
 * (A single archive is used because the extension API can write files but cannot create folders.)
 *
 * When it runs:
 *   - automatically once a day: ~2 min after you log in, then the extension checks
 *     hourly whether today's backup exists (only while EasyEDA Pro is open in Online mode);
 *     if some projects failed, it tries again an hour later (up to 3 runs a day);
 *   - manually: top menu "Backup → Backup all projects now".
 *
 * Settings (top menu "Backup"):
 *   - "Set backup folder…" — must be an existing folder; default is <Documents>/EasyEDA-Pro-backups
 *     (if that does not exist, archives go to <Documents> itself);
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
 *
 * MIT License, (c) 2026 Ivan Kravchenko
 */
"use strict";
var edaEsbuildExportName = (() => {
	// Default backup folder name inside the user's Documents folder
	const DEFAULT_FOLDER_NAME = 'EasyEDA-Pro-backups';
	// How often to check whether today's backup is done (ms)
	const CHECK_INTERVAL = 60 * 60 * 1000;
	// Delay after login before the first check, so the editor finishes loading (ms)
	const STARTUP_DELAY = 2 * 60 * 1000;

	// Automatic runs per day before giving up on failed projects until tomorrow
	const MAX_RUNS_PER_DAY = 3;
	// Delays between attempts of one API call (ms); network errors are often transient
	const RETRY_DELAYS = [2000, 5000];
	// Stop the run after this many network errors in a row; the hourly check retries later
	const MAX_NETWORK_ERRORS_IN_ROW = 4;

	let running = false;

	async function withRetry(fn) {
		for (let attempt = 0; ; attempt++) {
			try {
				return await fn();
			} catch (e) {
				if (attempt >= RETRY_DELAYS.length) throw e;
				await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
			}
		}
	}

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
		const d = new Date();
		const p = (n) => String(n).padStart(2, '0');
		return `${today()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
	}

	function safe(name) {
		return String(name || 'unnamed').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').trim() || 'unnamed';
	}

	// Progress bar is shown only for manual runs, so the daily automatic backup
	// does not pop up over the user's work
	function progress(show, pct, title) {
		if (!show) return;
		try {
			eda.sys_LoadingAndProgressBar.showProgressBar(Math.max(0, Math.min(99, Math.round(pct))), title);
		} catch (e) {}
	}

	function hideProgress(show) {
		if (!show) return;
		try {
			eda.sys_LoadingAndProgressBar.destroyProgressBar();
		} catch (e) {}
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
		const zipName = `EasyEDA-backup_${date}.zip`;
		const log = [`EasyEDA project backup ${now()}`];
		const zip = new ZipWriter();
		let ok = 0;
		const failed = [];
		let firstError = '';
		let summary = '';
		try {
			if (!eda.sys_Environment.isOnlineMode()) {
				log.push('Client is not in online mode, skipped');
				if (manual) toast('Backup skipped: EasyEDA is not in online mode', 'warn');
				return;
			}
			toast('Project backup started…');
			progress(manual, 0, 'Backup: listing projects…');
			const projects = await collectProjects(log);
			log.push(`Projects found: ${projects.size}`, '');

			const usedPaths = new Set();
			let index = 0;
			let networkErrorsInRow = 0;
			for (const [uuid, meta] of projects) {
				index++;
				if (networkErrorsInRow >= MAX_NETWORK_ERRORS_IN_ROW) {
					failed.push(uuid);
					log.push(`SKIP ${meta.team}/${meta.folderPath ? meta.folderPath + '/' : ''}${uuid}: network looks down, will retry later`);
					continue;
				}
				let name = uuid;
				try {
					const info = await withRetry(() => eda.dmt_Project.getProjectInfo(uuid));
					if (info && info.friendlyName) name = info.friendlyName;
				} catch (e) {}
				progress(manual, ((index - 1) / projects.size) * 100, `Backup ${index}/${projects.size}: ${name}`);
				const label = `${meta.team}/${meta.folderPath ? meta.folderPath + '/' : ''}${name}`;
				try {
					// .epro2, not .epro: for projects stored in the older format the .epro export
					// contains only project.json without any schematic/PCB data
					const file = await withRetry(() => eda.sys_FileManager.getProjectFileByProjectUuid(uuid, safe(name), undefined, 'epro2'));
					if (!file) throw new Error('empty file returned');
					const data = new Uint8Array(await file.arrayBuffer());
					if (!hasProjectData(data)) throw new Error('export contains no project data (only project2.json)');
					let path = [safe(meta.team), meta.folderPath, safe(name)].filter(Boolean).join('/');
					if (usedPaths.has(path)) path += '_' + uuid.slice(0, 8);
					usedPaths.add(path);
					zip.add(path + '.epro2', data);
					ok++;
					networkErrorsInRow = 0;
					log.push(`OK   ${label}  (${file.size} bytes)`);
				} catch (e) {
					const msg = (e && e.message) || String(e);
					networkErrorsInRow = /network/i.test(msg) ? networkErrorsInRow + 1 : 0;
					if (!firstError) firstError = msg;
					failed.push(name);
					log.push(`FAIL ${label}  [${uuid}]: ${msg}`);
				}
			}
			log.push('', `Done ${now()}: ${ok} ok, ${failed.length} failed`);
			summary = `${now()}: ${ok} ok, ${failed.length} failed` + (firstError ? `\nFirst error: ${firstError}` : '');
		} catch (e) {
			log.push(`Backup crashed: ${e && e.stack ? e.stack : e}`);
			summary = `${now()}: crashed: ${e && e.message}`;
		} finally {
			try {
				if (summary) {
					progress(manual, 99, 'Backup: writing archive…');
					zip.add('backup-log.txt', new TextEncoder().encode(log.join('\n') + '\n'));
					// A run that saved nothing must not overwrite a good archive of the same day,
					// and must not look like a backup to the prune script
					const where = await writeArchive(zip.toBlob(), ok > 0 ? zipName : `EasyEDA-backup_${date}_FAILED.zip`);
					summary += `\nArchive: ${where}`;
					// The day counts as done only when every project was saved, or after
					// MAX_RUNS_PER_DAY attempts (so a permanent error does not rerun every hour)
					const runs = eda.sys_Storage.getExtensionUserConfig('runsDate') === date ? (eda.sys_Storage.getExtensionUserConfig('runsCount') || 0) + 1 : 1;
					await eda.sys_Storage.setExtensionUserConfig('runsDate', date);
					await eda.sys_Storage.setExtensionUserConfig('runsCount', runs);
					if ((ok > 0 && failed.length === 0) || runs >= MAX_RUNS_PER_DAY) await eda.sys_Storage.setExtensionUserConfig('lastBackupDate', date);
					toast(
						`Backup finished: ${ok} projects saved` + (failed.length ? `, ${failed.length} failed` : ''),
						failed.length ? 'warn' : 'success',
					);
				}
			} catch (e) {
				summary += `\nCould not write ${zipName}: ${e && e.message}`;
				toast('Backup failed: ' + (e && e.message), 'error');
			}
			hideProgress(manual);
			if (summary) await eda.sys_Storage.setExtensionUserConfig('lastBackupSummary', summary);
			running = false;
		}
	}

	// Writes the archive into the backup folder. Extensions cannot create folders,
	// so if the default folder does not exist yet, fall back to Documents itself.
	async function writeArchive(blob, fileName) {
		const root = await getBackupRoot();
		if (await save(root, blob, fileName)) return `${root}/${fileName}`;
		if (!eda.sys_Storage.getExtensionUserConfig('backupRoot')) {
			const docs = await eda.sys_FileSystem.getDocumentsPath();
			if (await save(docs, blob, fileName)) return `${docs}/${fileName} (create ${root} to use it)`;
		}
		throw new Error(`cannot write ${root}/${fileName} — does the folder exist?`);
	}

	// An .epro2 file is a zip archive; a real export has project2.json plus at least one
	// data file (*.epru etc.). Reads the central directory to list the entries.
	function hasProjectData(bytes) {
		try {
			const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			let end = bytes.length - 22;
			while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
			if (end < 0) return false;
			const count = v.getUint16(end + 10, true);
			let p = v.getUint32(end + 16, true);
			for (let i = 0; i < count; i++) {
				const nameLen = v.getUint16(p + 28, true);
				const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
				if (!name.endsWith('/') && !/^project2?\.json$/.test(name)) return true;
				p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
			}
		} catch (e) {}
		return false;
	}

	// Minimal ZIP writer (STORE, no compression: .epro2 files are already compressed)
	const CRC_TABLE = (() => {
		const t = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			t[n] = c >>> 0;
		}
		return t;
	})();

	function crc32(data) {
		let c = 0xffffffff;
		for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	}

	class ZipWriter {
		constructor() {
			this.parts = [];
			this.central = [];
			this.offset = 0;
			const d = new Date();
			this.time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
			this.date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
		}

		add(name, data) {
			const nameBytes = new TextEncoder().encode(name);
			const crc = crc32(data);
			const local = new DataView(new ArrayBuffer(30));
			local.setUint32(0, 0x04034b50, true);
			local.setUint16(4, 20, true);
			local.setUint16(6, 0x0800, true); // UTF-8 names
			local.setUint16(8, 0, true); // STORE
			local.setUint16(10, this.time, true);
			local.setUint16(12, this.date, true);
			local.setUint32(14, crc, true);
			local.setUint32(18, data.length, true);
			local.setUint32(22, data.length, true);
			local.setUint16(26, nameBytes.length, true);
			local.setUint16(28, 0, true);

			const cen = new DataView(new ArrayBuffer(46));
			cen.setUint32(0, 0x02014b50, true);
			cen.setUint16(4, 20, true);
			cen.setUint16(6, 20, true);
			cen.setUint16(8, 0x0800, true);
			cen.setUint16(10, 0, true);
			cen.setUint16(12, this.time, true);
			cen.setUint16(14, this.date, true);
			cen.setUint32(16, crc, true);
			cen.setUint32(20, data.length, true);
			cen.setUint32(24, data.length, true);
			cen.setUint16(28, nameBytes.length, true);
			cen.setUint32(42, this.offset, true);

			this.parts.push(local, nameBytes, data);
			this.central.push(cen, nameBytes);
			this.offset += 30 + nameBytes.length + data.length;
		}

		toBlob() {
			const cenSize = this.central.reduce((s, p) => s + p.byteLength, 0);
			const end = new DataView(new ArrayBuffer(22));
			const count = this.central.length / 2;
			end.setUint32(0, 0x06054b50, true);
			end.setUint16(8, count, true);
			end.setUint16(10, count, true);
			end.setUint32(12, cenSize, true);
			end.setUint32(16, this.offset, true);
			return new Blob([...this.parts, ...this.central, end], { type: 'application/zip' });
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
