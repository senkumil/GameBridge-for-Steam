import type { SteamGameData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { escapeRegex } from '../../core/text';
import { gdlText } from '../../steam/localization';

interface LinkedNoteCopy {
	heading: string;
	officialName: string;
	steamAppId: string;
	curiosityHeading: string;
	franchise: string;
	developerRelease: string;
	developer: string;
	twoGenres: string;
	oneGenre: string;
	releaseOnly: string;
	fallback: string;
}

const linkedNoteTitleSync = new Set<string>();

const LINKED_NOTE_COPY_ENGLISH: LinkedNoteCopy = {
	heading: 'Game information', officialName: 'Official name', steamAppId: 'Steam AppID', curiosityHeading: 'Did you know?',
	franchise: '{name} is part of the {franchise} franchise.', developerRelease: '{name} was developed by {developer} and released on {date}.', developer: '{name} was developed by {developer}.',
	twoGenres: 'Steam mainly classifies {name} as {genre1} and {genre2}.', oneGenre: 'Steam classifies {name} as {genre1}.', releaseOnly: '{name} was released on {date}.', fallback: 'The artwork and details shown for {name} come from its official Steam page.',
};

function linkedNoteCopy(): LinkedNoteCopy {
	return { ...LINKED_NOTE_COPY_ENGLISH, heading: gdlText('game_information', LINKED_NOTE_COPY_ENGLISH.heading) };
}

function formatLinkedNoteCopy(template: string, values: Record<string, string>): string {
	let result = template;
	for (const [key, value] of Object.entries(values)) result = result.replace(new RegExp(`\\{${escapeRegex(key)}\\}`, 'g'), value);
	return result;
}

function cleanLinkedNoteValue(value: unknown): string {
	return String(value ?? '').replace(/[\[\]]/g, '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function linkedGameCuriosity(data: SteamGameData, fallbackName: string): string {
	const copy = linkedNoteCopy();
	const name = cleanLinkedNoteValue(data.name || fallbackName);
	const franchise = (data.franchises || []).map(cleanLinkedNoteValue).find(Boolean) || '';
	const developer = (data.developers || []).map(cleanLinkedNoteValue).find(Boolean) || '';
	const release = cleanLinkedNoteValue(data.release_date?.date);
	const genres = (data.genres || []).map(genre => cleanLinkedNoteValue(genre.description)).filter(Boolean);
	const values = { name, franchise, developer, date: release, genre1: genres[0] || '', genre2: genres[1] || '' };
	if (franchise) return formatLinkedNoteCopy(copy.franchise, values);
	if (developer && release) return formatLinkedNoteCopy(copy.developerRelease, values);
	if (developer) return formatLinkedNoteCopy(copy.developer, values);
	if (genres.length >= 2) return formatLinkedNoteCopy(copy.twoGenres, values);
	if (genres.length === 1) return formatLinkedNoteCopy(copy.oneGenre, values);
	if (release) return formatLinkedNoteCopy(copy.releaseOnly, values);
	return formatLinkedNoteCopy(copy.fallback, values);
}

export async function saveLinkedGameNote(shortcutName: string, data: SteamGameData, steamAppId: string, createIfMissing = true): Promise<boolean> {
	const gameNotes = (window as any).SteamClient?.GameNotes;
	if (!gameNotes || typeof gameNotes.GetNotes !== 'function' || typeof gameNotes.SaveNotes !== 'function') {
		backendLog('Linked note skipped: Steam GameNotes API unavailable');
		return false;
	}
	const safeName = String(shortcutName || '').trim();
	if (!safeName) return false;
	const fileName = 'notes_shortcut_' + safeName.replace(/[!-/:-@ [\\\]^`]/g, '_');
	const imageDir = fileName + '_images/';
	const clean = cleanLinkedNoteValue;
	const developers = Array.isArray(data.developers) ? data.developers.map(clean).filter(Boolean).join(', ') : '';
	const publishers = Array.isArray(data.publishers) ? data.publishers.map(clean).filter(Boolean).join(', ') : '';
	const release = clean(data.release_date?.date);
	const noteCopy = linkedNoteCopy();
	const officialName = clean(data.name || safeName);
	const curiosity = linkedGameCuriosity(data, officialName);
	const marker = '[gdl-link-note]';
	const now = Math.floor(Date.now() / 1000);
	try {
		const loaded = await gameNotes.GetNotes(fileName, imageDir);
		let notes: any[] = [];
		if (typeof loaded?.notes === 'string' && loaded.notes.trim()) {
			try {
				const parsed = JSON.parse(loaded.notes);
				if (Array.isArray(parsed?.notes)) notes = parsed.notes;
			} catch (error) { backendLog('Linked note parse failed: ' + error); }
		}
		const body = [
			marker,
			`[b]${noteCopy.heading}[/b]`,
			`${noteCopy.officialName}: ${officialName}`,
			`${noteCopy.steamAppId}: ${clean(steamAppId)}`,
			developers ? `${gdlText('developer', 'Developer')}: ${developers}` : '',
			publishers ? `${gdlText('publisher', 'Publisher')}: ${publishers}` : '',
			release ? `${gdlText('release_date', 'Release date')}: ${release}` : '',
			'',
			`[b]${noteCopy.curiosityHeading}[/b]`,
			curiosity,
		].filter(Boolean).join('\n');
		const existing = notes.find(note => String(note?.id || '').startsWith('gdl_link_') || String(note?.content || '').includes(marker));
		if (!existing && !createIfMissing) return false;
		const note = {
			...(existing || {}),
			id: existing?.id || `gdl_link_${Date.now().toString(36)}`,
			shortcut_name: safeName,
			ordinal: existing?.ordinal ?? 0,
			time_created: existing?.time_created || now,
			time_modified: now,
			title: officialName,
			content: body,
		};
		const index = existing ? notes.indexOf(existing) : -1;
		if (index >= 0) notes[index] = note;
		else notes.unshift(note);
		const result = await gameNotes.SaveNotes(fileName, JSON.stringify({ shortcut_name: safeName, notes }));
		if (typeof gameNotes.SyncToServer === 'function') {
			try { await gameNotes.SyncToServer(); } catch (error) { backendLog('Linked note sync skipped: ' + error); }
		}
		const ok = result === undefined || result === 1;
		backendLog(`Linked game note ${ok ? 'saved' : 'failed'} for shortcut ${safeName}`);
		return ok;
	} catch (error) {
		backendLog('Linked game note failed: ' + error);
		return false;
	}
}

/** Create or refresh the plugin note in the current Steam language. */
export async function syncLinkedGameNote(shortcutName: string, data: SteamGameData, steamAppId: string): Promise<void> {
	const safeShortcutName = String(shortcutName || '').trim();
	if (!safeShortcutName) return;
	const key = `${steamAppId}:${safeShortcutName}`;
	if (linkedNoteTitleSync.has(key)) return;
	linkedNoteTitleSync.add(key);
	await saveLinkedGameNote(safeShortcutName, data, steamAppId, true).catch(error => backendLog('Linked note refresh skipped: ' + error));
}

export function clearLinkedNoteSyncState(): void {
	linkedNoteTitleSync.clear();
}
