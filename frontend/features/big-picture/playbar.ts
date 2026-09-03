import type { LocalAchievementData } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import { detectConnectedController } from '../library/controller';
import { CONTROLLERS_IMAGE_DATA_URI } from './controllers-asset';
import { getInstantPlaytimeStats } from '../playtime/service';
import { formatLastPlayedDate, formatPlaytimeMinutes } from '../playtime/format';
import { getShortcutAppById } from '../../steam/shortcuts';

function cloudSynchronizedSvg(): string {
	return `<svg class="gdl-bp-cloud-svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 17l-3.5-3.5 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`;
}

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

	// Only check for native cloud status in the vicinity of the game details container
	const hasNativeCloud = Boolean(
		parent?.querySelector('[class*="CloudStatus"], [class*="cloudStatus"], [class*="CloudSync"], [class*="cloudSync"]')
	);

	if (hasNativeCloud) {
		doc.getElementById('gdl-bp-cloud-divider')?.remove();
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
		cloudDivider.innerHTML = `
			<div class="gdl-bp-cloud-badge">
				${cloudSynchronizedSvg()}
				<span>${cloudTitle}: ${escapeHtml(cloudState)}</span>
			</div>
		`;
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
		if (child.id?.startsWith('gdl-bp-stat-')) return false;
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
		if (child.id?.startsWith('gdl-bp-stat-')) return false;
		const t = (child.textContent || '').toLowerCase();
		if (nativePlaytimeTokens.some(tok => t.includes(tok))) return true;
		return t.includes('tiempo de juego') || t.includes('play time') || t.includes('playtime')
			|| t.includes('temps de jeu') || t.includes('spielzeit') || t.includes('tempo di gioco')
			|| t.includes('время в игре') || t.includes('czas gry') || t.includes('oyun süresi')
			|| t.includes('游戏时间') || t.includes('遊戲時間') || t.includes('プレイ時間') || t.includes('플레이 시간');
	});

	// Inject or update "LAST SESSION" if not provided by Steam native
	let lastSessionStat = playbarStats.querySelector<HTMLElement>('#gdl-bp-stat-last-session');
	if (!hasNativeLastSession) {
		const lastPlayedText = lastPlayedTimestamp > 0
			? formatLastPlayedDate(lastPlayedTimestamp)
			: (loc('DateTime_Today', '') || gdlText('last_played_today', 'Today'));

		if (!lastSessionStat) {
			lastSessionStat = doc.createElement('div');
			lastSessionStat.id = 'gdl-bp-stat-last-session';
			lastSessionStat.className = 'gdl-bp-playbar-stat';
		}
		const lastSessionLabel = loc('AppDetails_SectionTitle_LastSession', '') || loc('AppDetails_SectionTitle_LastPlayed', '') || gdlText('last_played_section_title', 'LAST SESSION');
		lastSessionStat.innerHTML = `
			<div class="gdl-bp-stat-label">${escapeHtml(lastSessionLabel.toUpperCase())}</div>
			<div class="gdl-bp-stat-value">${escapeHtml(lastPlayedText)}</div>
		`;
	} else if (lastSessionStat) {
		lastSessionStat.remove();
		lastSessionStat = null;
	}

	// Inject or update "PLAY TIME" if not provided by Steam native
	let playtimeStat = playbarStats.querySelector<HTMLElement>('#gdl-bp-stat-playtime');
	if (!hasNativePlaytime && minutesForever > 0) {
		const playtimeText = formatPlaytimeMinutes(minutesForever);
		if (!playtimeStat) {
			playtimeStat = doc.createElement('div');
			playtimeStat.id = 'gdl-bp-stat-playtime';
			playtimeStat.className = 'gdl-bp-playbar-stat';
		}
		const playtimeLabel = loc('AppDetails_SectionTitle_Playtime', '') || gdlText('playtime_section_title', 'PLAY TIME');
		playtimeStat.innerHTML = `
			<div class="gdl-bp-stat-label">${escapeHtml(playtimeLabel.toUpperCase())}</div>
			<div class="gdl-bp-stat-value">${escapeHtml(playtimeText)}</div>
		`;
	} else if (playtimeStat) {
		playtimeStat.remove();
		playtimeStat = null;
	}

	// Hide duplicate native achievements block if we have achievements to show
	const nativeAchievementTokens = [
		loc('AppDetails_SectionTitle_Achievements', ''),
		loc('AppDetails_Achievements', ''),
	].map(s => s.trim().toLowerCase()).filter(Boolean);

	if (achievements && achievements.total > 0) {
		Array.from(playbarStats.children).forEach(child => {
			if (child.id?.startsWith('gdl-bp-stat-')) return;
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
		if (child.id?.startsWith('gdl-bp-stat-')) return false;
		const text = (child.textContent || '').toLowerCase();
		if (nativeControlTokens.some(tok => text.includes(tok))) return true;
		return text.includes('control') || text.includes('controller') || text.includes('mando')
			|| text.includes('contrôleur') || text.includes('manette') || text.includes('контроллер')
			|| text.includes('kontroler') || text.includes('denetleyici') || text.includes('控制器')
			|| text.includes('コントローラ') || text.includes('컨트롤러');
	});

	let ctrlStat = playbarStats.querySelector<HTMLElement>('#gdl-bp-stat-control');
	if (hasConnectedController && !hasNativeControl) {
		if (!ctrlStat) {
			ctrlStat = doc.createElement('div');
			ctrlStat.id = 'gdl-bp-stat-control';
			ctrlStat.className = 'gdl-bp-playbar-stat';
		}
		ctrlStat.innerHTML = `
			<div class="gdl-bp-stat-label">${escapeHtml(loc('AppDetails_SectionTitle_Controller', 'CONTROL').toUpperCase())}</div>
			<div class="gdl-bp-stat-value gdl-bp-ctrl-icons">
				<img class="gdl-bp-ctrl-img" src="${CONTROLLERS_IMAGE_DATA_URI}" alt="Control" />
			</div>
		`;
	} else if (ctrlStat) {
		ctrlStat.remove();
		ctrlStat = null;
	}

	ensureGamepadListeners(doc, tabStrip, achievements, shortcutAppId);

	// Inject or update Achievements in playbar
	let achStat = playbarStats.querySelector<HTMLElement>('#gdl-bp-stat-achievements');
	if (achievements && achievements.total > 0) {
		if (!achStat) {
			achStat = doc.createElement('div');
			achStat.id = 'gdl-bp-stat-achievements';
			achStat.className = 'gdl-bp-playbar-stat';
		}
		const pct = Math.max(0, Math.min(100, Math.round((achievements.unlocked * 100) / Math.max(1, achievements.total))));
		achStat.innerHTML = `
			<div class="gdl-bp-stat-label">${escapeHtml(loc('AppDetails_SectionTitle_Achievements', 'LOGROS').toUpperCase())}</div>
			<div class="gdl-bp-stat-value gdl-bp-ach-value">
				<span>${achievements.unlocked}/${achievements.total}</span>
				<div class="gdl-bp-stat-progress-track">
					<div class="gdl-bp-stat-progress-fill" style="width:${pct}%"></div>
				</div>
			</div>
		`;
	} else if (achStat) {
		achStat.remove();
		achStat = null;
	}

	// Keep strict visual order: Última Sesión -> Tiempo de Juego -> Control -> Logros
	const ordered = [lastSessionStat, playtimeStat, ctrlStat, achStat].filter(Boolean) as HTMLElement[];
	for (const el of ordered) {
		playbarStats.appendChild(el);
	}
}

export function removeBigPicturePlaybarEnhancements(doc: Document): void {
	doc.getElementById('gdl-bp-cloud-divider')?.remove();
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
