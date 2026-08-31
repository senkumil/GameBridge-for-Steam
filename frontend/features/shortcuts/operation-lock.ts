/** Serialize identity mutations for one concrete Steam shortcut. Steam rebuilds
 * shortcut rows asynchronously, so an unlink and an immediate relink must not
 * update the same mapping/artwork concurrently. */
const mutationTails = new Map<string, Promise<void>>();

function normalizedKey(value: unknown): string {
	const numeric = Number(value);
	if (Number.isFinite(numeric) && numeric !== 0) {
		const unsigned = numeric < 0 ? numeric >>> 0 : numeric;
		return `shortcut:${unsigned}`;
	}
	return String(value || '').trim().toLocaleLowerCase();
}

export function shortcutMutationKeys(options: {
	shortcutAppId?: string | number | null;
	title?: string;
	exePath?: string | null;
	exePaths?: Array<string | null | undefined>;
}): string[] {
	const keys = new Set<string>();
	const shortcutKey = normalizedKey(options.shortcutAppId);
	if (shortcutKey) keys.add(shortcutKey);
	for (const path of [options.exePath, ...(options.exePaths || [])]) {
		const normalizedPath = String(path || '').trim().replace(/\//g, '\\').toLocaleLowerCase();
		if (normalizedPath) keys.add(`exe:${normalizedPath}`);
	}
	if (keys.size === 0) {
		const title = String(options.title || '').trim().toLocaleLowerCase();
		keys.add(`title:${title || 'unknown'}`);
	}
	return Array.from(keys).sort();
}

export async function runShortcutMutation<T>(key: string, operation: () => Promise<T>): Promise<T> {
	const previous = mutationTails.get(key) || Promise.resolve();
	let release!: () => void;
	const gate = new Promise<void>(resolve => { release = resolve; });
	const tail = previous.catch(() => {}).then(() => gate);
	mutationTails.set(key, tail);
	await previous.catch(() => {});
	try {
		return await operation();
	} finally {
		release();
		if (mutationTails.get(key) === tail) mutationTails.delete(key);
	}
}

/** A shortcut can receive a new Steam AppID after its display name changes.
 * Hold both the old/new ID and every known executable identity so an unlink
 * cannot overtake an in-progress link while Steam rebuilds that row. */
export function runShortcutMutations<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
	const ordered = Array.from(new Set(keys.filter(Boolean))).sort();
	const run = (index: number): Promise<T> => index >= ordered.length
		? operation()
		: runShortcutMutation(ordered[index], () => run(index + 1));
	return run(0);
}
