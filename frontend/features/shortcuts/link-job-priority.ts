let activePriorityShortcutId: number | null = null;
let activePriorityTitle: string | null = null;

export function setPriorityShortcut(shortcutId: number | null | undefined, title = ''): void {
	activePriorityShortcutId = shortcutId != null ? Number(shortcutId) : null;
	activePriorityTitle = title ? title.trim().toLowerCase() : null;
}

export function isPriorityShortcut(shortcutId: number | null | undefined, title = ''): boolean {
	if (activePriorityShortcutId != null && shortcutId != null && Number(shortcutId) === activePriorityShortcutId) return true;
	if (activePriorityTitle && title && title.trim().toLowerCase() === activePriorityTitle) return true;
	return false;
}

export function getPriorityShortcut(): { id: number | null; title: string | null } {
	return { id: activePriorityShortcutId, title: activePriorityTitle };
}
