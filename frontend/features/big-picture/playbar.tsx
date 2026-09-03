import React from 'react';
import type { LocalAchievementData } from '../../domain/types';
import { gdlText, loc } from '../../steam/localization';
import { detectConnectedController } from '../library/controller';
import { CONTROLLERS_IMAGE_DATA_URI } from './controllers-asset';
import { getInstantPlaytimeStats } from '../playtime/service';
import { formatLastPlayedDate, formatPlaytimeMinutes } from '../playtime/format';
import { getShortcutAppById } from '../../steam/shortcuts';
import { BigPicturePlaybarStats } from './BigPicturePlaybarStats';
import { BigPictureCloudDivider } from './BigPictureCloudDivider';

interface ActiveGamepadContext {
	doc: Document;
	tabStrip: HTMLElement;
	achievements: LocalAchievementData | null;
	shortcutAppId?: number;
}

let activeGamepadContext: ActiveGamepadContext | null = null;
let gamepadListenerBound = false;

function ensureGamepadListeners(doc: Document, tabStrip: HTMLElement, achievements: LocalAchievementData | null, shortcutAppId?: number): void {
	activeGamepadContext = { doc, tabStrip, achievements, shortcutAppId };
	if (gamepadListenerBound || typeof window === 'undefined') return;
	gamepadListenerBound = true;

	const handleGamepadUpdate = () => {
		const ctx = activeGamepadContext;
		if (!ctx || !ctx.doc || !ctx.tabStrip || !ctx.tabStrip.isConnected) return;
		try {
			syncBigPicturePlaybarEnhancements(ctx.doc, ctx.tabStrip, ctx.achievements, ctx.shortcutAppId);
		} catch {}
		setTimeout(() => {
			const current = activeGamepadContext;
			if (current && current.tabStrip?.isConnected) {
				syncBigPicturePlaybarEnhancements(current.doc, current.tabStrip, current.achievements, current.shortcutAppId);
			}
		}, 80);
	};

	window.addEventListener('gamepadconnected', handleGamepadUpdate);
	window.addEventListener('gamepaddisconnected', handleGamepadUpdate);

	try {
		const steamInput = (window as any).SteamClient?.Input;
		if (typeof steamInput?.RegisterForControllerListChanges === 'function') {
			steamInput.RegisterForControllerListChanges(() => {
				handleGamepadUpdate();
			});
		}
	} catch {}
}

export function syncBigPicturePlaybarEnhancements(
	doc: Document,
	tabStrip: HTMLElement,
	achievements: LocalAchievementData | null,
	shortcutAppId?: number,
): void {
	if (!doc || !tabStrip || !tabStrip.isConnected) return;

	// 1. Steam Cloud Status Subtitle Line placed ABOVE the tab strip
	const tabContainer = tabStrip.closest<HTMLElement>('[class*="TabsContainer"], [class*="tabsContainer"], [class*="TabsRow"], [class*="tabsRow"], [class*="TabsStrip"], [class*="tabsStrip"], [role="tablist"]') || tabStrip;
	const parent = tabContainer.parentElement;

	const hasNativeCloud = Boolean(
		parent?.querySelector('[class*="CloudStatus"], [class*="cloudStatus"], [class*="CloudSync"], [class*="cloudSync"]')
	);

	const win = doc.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);

	if (hasNativeCloud) {
		const old = doc.getElementById('gdl-bp-cloud-divider');
		if (old) {
			try {
				const r = (old as any).__gdlReactRoot;
				if (r && typeof r.unmount === 'function') r.unmount();
			} catch {}
			old.remove();
		}
	} else if (parent) {
		parent.style.flexWrap = 'wrap';
		let cloudDivider = doc.getElementById('gdl-bp-cloud-divider');
		if (!cloudDivider) {
			cloudDivider = doc.createElement('div');
			cloudDivider.id = 'gdl-bp-cloud-divider';
			cloudDivider.className = 'gdl-bp-cloud-divider';
			parent.insertBefore(cloudDivider, tabContainer);
		} else if (cloudDivider.parentElement !== parent || cloudDivider.nextElementSibling !== tabContainer) {
			parent.insertBefore(cloudDivider, tabContainer);
		}

		const cloudTitle = 'STEAM CLOUD';
		const cloudState = loc('AppDetails_CloudStatus_Synchronized', 'ACTUALIZADO').toUpperCase();

		let cloudRoot = (cloudDivider as any).__gdlReactRoot;
		if (!cloudRoot && reactDom && typeof reactDom.createRoot === 'function') {
			cloudRoot = reactDom.createRoot(cloudDivider);
			(cloudDivider as any).__gdlReactRoot = cloudRoot;
		}

		const cloudElement = <BigPictureCloudDivider title={cloudTitle} state={cloudState} />;
		try {
			if (cloudRoot && typeof cloudRoot.render === 'function') {
				cloudRoot.render(cloudElement);
			} else if (reactDom && typeof reactDom.render === 'function') {
				reactDom.render(cloudElement, cloudDivider);
			}
		} catch {}
	}

	// 2. Discover or create PlayBar stats row if available
	let playbarStats = doc.querySelector<HTMLElement>('[class*="PlayBarStats"], [class*="playbarStats"], [class*="GameStatsSection"], [class*="gameStatsSection"]');
	if (!playbarStats) {
		const playButton = doc.querySelector<HTMLElement>('[class*="PlayButton"], [class*="playButton"], button[class*="Play"]');
		if (playButton?.parentElement) {
			playbarStats = playButton.parentElement.querySelector<HTMLElement>('[class*="Stats"], [class*="stats"]') || playButton.parentElement;
		}
	}

	if (!playbarStats || !playbarStats.isConnected) return;

	// Playtime and Last Played resolution
	const instantStats = shortcutAppId ? getInstantPlaytimeStats(shortcutAppId) : null;
	const app = shortcutAppId ? getShortcutAppById(shortcutAppId) : null;
	const minutesForever = Math.max(0, Number(instantStats?.minutesForever || 0), Number((app as any)?.minutes_playtime_forever || 0));
	const lastPlayedTimestamp = Number(instantStats?.lastPlayedAt || (app as any)?.rt_last_time_played || (app as any)?.rt_recent_activity_time || 0);

	// Check if Steam native already rendered "LAST SESSION" and "PLAY TIME"
	const nativeLastSessionTokens = [
		loc('AppDetails_SectionTitle_LastSession', ''),
		loc('AppDetails_SectionTitle_LastPlayed', ''),
		loc('AppDetails_LastPlayed', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	const hasNativeLastSession = Array.from(playbarStats.children).some(child => {
		if (child.id?.startsWith('gdl-bp-stat-') || child.id === 'gdl-bp-playbar-stats-mount') return false;
		const t = (child.textContent || '').toLowerCase();
		if (nativeLastSessionTokens.some(tok => t.includes(tok))) return true;
		return t.includes('última sesión') || t.includes('ultima sesion') || t.includes('last session') || t.includes('last played')
			|| t.includes('dernière session') || t.includes('letzte sitzung') || t.includes('ultima sessione') || t.includes('последний запуск')
			|| t.includes('最后运行') || t.includes('最後運行') || t.includes('最後にプレイ') || t.includes('최근 플레이');
	});

	const nativePlaytimeTokens = [
		loc('AppDetails_SectionTitle_Playtime', ''),
		loc('AppDetails_Playtime_Forever', ''),
		loc('AppDetails_Playtime', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	const hasNativePlaytime = Array.from(playbarStats.children).some(child => {
		if (child.id?.startsWith('gdl-bp-stat-') || child.id === 'gdl-bp-playbar-stats-mount') return false;
		const t = (child.textContent || '').toLowerCase();
		if (nativePlaytimeTokens.some(tok => t.includes(tok))) return true;
		return t.includes('tiempo de juego') || t.includes('play time') || t.includes('playtime')
			|| t.includes('temps de jeu') || t.includes('spielzeit') || t.includes('tempo di gioco')
			|| t.includes('время в игре') || t.includes('czas gry') || t.includes('oyun süresi')
			|| t.includes('游戏时间') || t.includes('遊戲時間') || t.includes('プレイ時間') || t.includes('플레이 시간');
	});

	// Hide duplicate native achievements block if we have achievements to show
	const nativeAchievementTokens = [
		loc('AppDetails_SectionTitle_Achievements', ''),
		loc('AppDetails_Achievements', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	if (achievements && achievements.total > 0) {
		Array.from(playbarStats.children).forEach(child => {
			if (child.id?.startsWith('gdl-bp-stat-') || child.id === 'gdl-bp-playbar-stats-mount') return;
			const text = (child.textContent || '').toLowerCase();
			if (nativeAchievementTokens.some(tok => text.includes(tok))
				|| text.includes('logros') || text.includes('achievements') || text.includes('erfolge') || text.includes('succès')
				|| text.includes('conquistas') || text.includes('trofei') || text.includes('достижения') || text.includes('osiągnięcia')
				|| text.includes('başarımlar') || text.includes('成就') || text.includes('実績') || text.includes('도전 과제')) {
				(child as HTMLElement).style.display = 'none';
			}
		});
	}

	// Detect connected controllers
	const gamepads = typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()).filter(gp => gp && gp.connected) : [];
	const ctrlInfo = detectConnectedController(doc);
	const hasConnectedController = ctrlInfo.connected || gamepads.length > 0;

	// Check if Steam native already rendered a "CONTROL" stat in the playbar
	const nativeControlTokens = [
		loc('AppDetails_SectionTitle_Controller', ''),
		loc('Controller_Header', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	const hasNativeControl = Array.from(playbarStats.children).some(child => {
		if (child.id?.startsWith('gdl-bp-stat-') || child.id === 'gdl-bp-playbar-stats-mount') return false;
		const text = (child.textContent || '').toLowerCase();
		if (nativeControlTokens.some(tok => text.includes(tok))) return true;
		return text.includes('control') || text.includes('controller') || text.includes('mando')
			|| text.includes('contrôleur') || text.includes('manette') || text.includes('контроллер')
			|| text.includes('kontroler') || text.includes('denetleyici') || text.includes('控制器')
			|| text.includes('コントローラ') || text.includes('컨트롤러');
	});

	ensureGamepadListeners(doc, tabStrip, achievements, shortcutAppId);

	// Mount or update React Playbar Stats component
	let statsMount = playbarStats.querySelector<HTMLElement>('#gdl-bp-playbar-stats-mount');
	if (!statsMount) {
		statsMount = doc.createElement('div');
		statsMount.id = 'gdl-bp-playbar-stats-mount';
		statsMount.style.display = 'contents';
		playbarStats.appendChild(statsMount);
	}

	let root = (statsMount as any).__gdlReactRoot;
	if (!root && reactDom && typeof reactDom.createRoot === 'function') {
		root = reactDom.createRoot(statsMount);
		(statsMount as any).__gdlReactRoot = root;
	}

	const lastPlayedText = lastPlayedTimestamp > 0
		? formatLastPlayedDate(lastPlayedTimestamp)
		: (loc('DateTime_Today', '') || gdlText('last_played_today', 'Today'));

	const lastSessionLabel = loc('AppDetails_SectionTitle_LastSession', '')
		|| loc('AppDetails_SectionTitle_LastPlayed', '')
		|| gdlText('last_played_section_title', 'LAST SESSION');

	const playtimeLabel = loc('AppDetails_SectionTitle_Playtime', '')
		|| gdlText('playtime_section_title', 'PLAY TIME');

	const controllerLabel = loc('AppDetails_SectionTitle_Controller', 'CONTROL');
	const achievementsLabel = loc('AppDetails_SectionTitle_Achievements', 'LOGROS');

	const element = (
		<BigPicturePlaybarStats
			lastSessionText={!hasNativeLastSession ? lastPlayedText : undefined}
			lastSessionLabel={!hasNativeLastSession ? lastSessionLabel.toUpperCase() : undefined}
			playtimeText={!hasNativePlaytime && minutesForever > 0 ? formatPlaytimeMinutes(minutesForever) : undefined}
			playtimeLabel={!hasNativePlaytime && minutesForever > 0 ? playtimeLabel.toUpperCase() : undefined}
			hasConnectedController={hasConnectedController && !hasNativeControl}
			controllerLabel={controllerLabel.toUpperCase()}
			controllerImageUri={CONTROLLERS_IMAGE_DATA_URI}
			achievements={achievements && achievements.total > 0 ? { unlocked: achievements.unlocked, total: achievements.total } : null}
			achievementsLabel={achievementsLabel.toUpperCase()}
		/>
	);

	try {
		if (root && typeof root.render === 'function') {
			root.render(element);
		} else if (reactDom && typeof reactDom.render === 'function') {
			reactDom.render(element, statsMount);
		}
	} catch (err) {
		console.error('[NGL][BigPicture] Error mounting PlaybarStats:', err);
	}
}

export function removeBigPicturePlaybarEnhancements(doc: Document): void {
	const cloud = doc.getElementById('gdl-bp-cloud-divider');
	if (cloud) {
		try {
			const r = (cloud as any).__gdlReactRoot;
			if (r && typeof r.unmount === 'function') r.unmount();
		} catch {}
		cloud.remove();
	}
	const statsMount = doc.getElementById('gdl-bp-playbar-stats-mount');
	if (statsMount) {
		try {
			const root = (statsMount as any).__gdlReactRoot;
			if (root && typeof root.unmount === 'function') {
				root.unmount();
			}
		} catch {}
		statsMount.remove();
	}
	doc.getElementById('gdl-bp-stat-last-session')?.remove();
	doc.getElementById('gdl-bp-stat-playtime')?.remove();
	doc.getElementById('gdl-bp-stat-control')?.remove();
	doc.getElementById('gdl-bp-stat-achievements')?.remove();
	const playbarStats = doc.querySelector<HTMLElement>('[class*="PlayBarStats"], [class*="playbarStats"], [class*="GameStatsSection"], [class*="gameStatsSection"]');
	if (playbarStats) {
		Array.from(playbarStats.children).forEach(child => {
			if ((child as HTMLElement).style.display === 'none') {
				(child as HTMLElement).style.display = '';
			}
		});
	}
}
