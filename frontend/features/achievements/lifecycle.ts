import type { LocalAchievementData } from '../../domain/types';
import { backendLog } from '../../api/backend';
import { cacheLocalAchievements } from './cache';
import { achievementRuntimeHost, clearAchievementRuntimeHost } from './context';
import { openLocalAchievementsModal } from './modal';
import { detectLinkedSteamAppId } from './navigation';
import { disposeAchievementNotifications, enqueueLocalAchievementToasts } from './notifications';
import { ensureLocalPlaybarStat } from './playbar';
import { fetchLocalAchievementData } from './service';
import { renderLocalAchievementSidebar } from './sidebar';
import { ensureLocalAchievementStyles } from './styles';
import { clearLocalAchievementGameInfoCache } from './game-info';
import { clearLocalAchievementCache } from './cache';

interface LocalAchievementDocumentState {
	timer: number | null;
	initialTimer: number | null;
	inFlight: boolean;
	signature: string;
	data: LocalAchievementData | null;
	cleanup: () => void;
}

const localAchievementDocState = new WeakMap<Document, LocalAchievementDocumentState>();
const localAchievementDocuments = new Set<Document>();

function localAchievementSignature(data: LocalAchievementData): string {
	return `${data.appid}|${data.state_appid || ''}|${data.unlocked}|${data.total}|`
		+ data.achievements.map(item => `${item.name}:${item.earned ? 1 : 0}:${item.earned_time}:${item.progress}`).join(',');
}

export function disposeLocalAchievementUI(doc: Document): void {
	const state = localAchievementDocState.get(doc);
	if (!state) return;
	localAchievementDocState.delete(doc);
	localAchievementDocuments.delete(doc);
	state.cleanup();
}

export function installLocalAchievementUI(doc: Document): void {
	if (localAchievementDocState.has(doc)) return;
	ensureLocalAchievementStyles(doc);

	let disposed = false;
	const state: LocalAchievementDocumentState = {
		timer: null,
		initialTimer: null,
		inFlight: false,
		signature: '',
		data: null,
		cleanup: () => {},
	};

	const refresh = async (): Promise<void> => {
		if (disposed || state.inFlight || !doc.body || doc.defaultView?.closed) return;
		const appid = detectLinkedSteamAppId(doc);
		if (!appid) {
			state.signature = '';
			state.data = null;
			return;
		}
		state.inFlight = true;
		try {
			const data = await fetchLocalAchievementData(appid, {
				stateAppId: achievementRuntimeHost().getCurrentInjectedShortcutAppId(),
			});
			if (disposed) return;
			if (!data?.found || !Array.isArray(data.achievements) || data.total <= 0) {
				const signature = `unavailable:${appid}`;
				if (state.signature !== signature) {
					backendLog(`Local achievements bridge returned no data for ${appid}`);
					state.signature = signature;
				}
				return;
			}
			cacheLocalAchievements(data, appid, achievementRuntimeHost().getCurrentInjectedShortcutAppId());
			enqueueLocalAchievementToasts(data);
			state.data = data;
			const signature = localAchievementSignature(data);
			const host = doc.querySelector('#gdl-achievements-content [data-gdl-local-ach="1"]');
			if (signature !== state.signature || !host) {
				renderLocalAchievementSidebar(doc, data);
				state.signature = signature;
			}
			ensureLocalPlaybarStat(doc, data);
		} catch (error) {
			if (!disposed) backendLog('Local achievements bridge error: ' + String(error));
		} finally {
			state.inFlight = false;
		}
	};

	const intercept = (event: Event): void => {
		const target = event.target as Element | null;
		if (!target?.closest?.('#gdl-achievements-section') || !state.data) return;
		if (state.data.appid !== detectLinkedSteamAppId(doc)) return;
		event.preventDefault();
		event.stopPropagation();
		(event as any).stopImmediatePropagation?.();
		void openLocalAchievementsModal(doc, state.data).catch(error => backendLog('Achievements modal error: ' + error));
	};
	const onKeyDown = (event: KeyboardEvent): void => {
		if ((event.key === 'Enter' || event.key === ' ') && (event.target as Element | null)?.closest?.('#gdl-achievements-section')) intercept(event);
	};

	doc.addEventListener('click', intercept, true);
	doc.addEventListener('keydown', onKeyDown, true);
	state.timer = window.setInterval(() => { void refresh(); }, 2000);
	void refresh();
	state.cleanup = () => {
		if (disposed) return;
		disposed = true;
		if (state.timer !== null) window.clearInterval(state.timer);
		state.timer = null;
		doc.removeEventListener('click', intercept, true);
		doc.removeEventListener('keydown', onKeyDown, true);
	};
	localAchievementDocState.set(doc, state);
	localAchievementDocuments.add(doc);
}

export function disposeAchievementRuntime(): void {
	for (const doc of Array.from(localAchievementDocuments)) disposeLocalAchievementUI(doc);
	disposeAchievementNotifications();
	clearLocalAchievementCache();
	clearLocalAchievementGameInfoCache();
	clearAchievementRuntimeHost();
}
