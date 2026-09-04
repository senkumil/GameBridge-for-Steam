/**
 * Typed Event Bus for NativeGameLink
 * Low-overhead, decoupled event bus for hot synchronization across UI components.
 */

export interface NativeGameLinkEventMap {
	selectedGameChanged: { shortcutAppId: string; steamAppId?: string; title?: string };
	linkedGameChanged: { shortcutAppId: string; linkedSteamAppId: string; title?: string };
	linkedGameRemoved: { shortcutAppId: string; formerSteamAppId?: string };
	linkedGameRelinked: { shortcutAppId: string; oldSteamAppId: string; newSteamAppId: string };
	achievementsChanged: { steamAppId: string; shortcutAppId?: string };
	achievementUnlocked: { steamAppId: string; shortcutAppId?: string; achievementName: string };
	simulatedAchievementsChanged: { steamAppId: string; enabled: boolean };
	metadataUpdated: { steamAppId: string };
	artworkUpdated: { steamAppId: string; shortcutAppId?: string; slot?: string; userAction?: boolean };
	activityUpdated: { steamAppId: string };
	newsUpdated: { steamAppId: string };
	gameInfoUpdated: { steamAppId: string };
	settingsChanged: { key: string; value: unknown };
	uiModeChanged: { mode: 'desktop' | 'gamepad'; isGamepadUI: boolean; isDesktop: boolean };
	playtimeUpdated: { shortcutAppId: string; minutes: number };
	controllerChanged: { connected: boolean; type: string };
}

type EventListener<T> = (payload: T) => void;

class NativeGameLinkEventBus {
	private listeners = new Map<keyof NativeGameLinkEventMap, Set<EventListener<any>>>();

	public on<K extends keyof NativeGameLinkEventMap>(
		event: K,
		handler: EventListener<NativeGameLinkEventMap[K]>,
	): () => void {
		let set = this.listeners.get(event);
		if (!set) {
			set = new Set();
			this.listeners.set(event, set);
		}
		set.add(handler);
		return () => {
			set?.delete(handler);
		};
	}

	public emit<K extends keyof NativeGameLinkEventMap>(
		event: K,
		payload: NativeGameLinkEventMap[K],
	): void {
		const set = this.listeners.get(event);
		if (set && set.size > 0) {
			for (const listener of Array.from(set)) {
				try {
					listener(payload);
				} catch (error) {
					console.error(`[NGL][Events] Error in listener for "${String(event)}":`, error);
				}
			}
		}

		// Bridge to window CustomEvent for cross-context observation if available
		try {
			if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
				window.dispatchEvent(new CustomEvent(`ngl:${String(event)}`, { detail: payload }));
			}
		} catch {}
	}

	public clear(): void {
		this.listeners.clear();
	}
}

export const nglEvents = new NativeGameLinkEventBus();
