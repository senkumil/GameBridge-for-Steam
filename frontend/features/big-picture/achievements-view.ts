import type { LocalAchievementData, LocalAchievementItem } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import { formatLastPlayedDate, formatPlaytimeMinutes } from '../playtime/format';
import { getInstantPlaytimeStats } from '../playtime/service';
import { getShortcutAppById } from '../../steam/shortcuts';

function medalSvg(): string {
	return `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
		<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
	</svg>`;
}

function formatUnlockDate(timestamp?: number): string {
	if (!timestamp || timestamp <= 0) return '';
	try {
		const d = new Date(timestamp * 1000);
		return d.toLocaleDateString(steamIntlLocale(), {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	} catch {
		return '';
	}
}

export function openBigPictureAchievementsScreen(
	doc: Document,
	achievements: LocalAchievementData,
	gameName: string,
	portraitUrl: string,
	shortcutAppId?: number,
): void {
	doc.getElementById('gdl-bp-achievements-screen')?.remove();
	if (!doc.body) return;

	const total = achievements.total || 0;
	const unlocked = achievements.unlocked || 0;
	const pct = total > 0 ? Math.round((unlocked * 100) / total) : 0;
	const isAllUnlocked = unlocked >= total && total > 0;

	// Playtime stats
	const instantStats = shortcutAppId ? getInstantPlaytimeStats(shortcutAppId) : null;
	const app = shortcutAppId ? getShortcutAppById(shortcutAppId) : null;
	const minutesForever = Math.max(0, Number(instantStats?.minutesForever || 0), Number((app as any)?.minutes_playtime_forever || 0));
	const playtimeText = minutesForever > 0 ? formatPlaytimeMinutes(minutesForever) : '';
	const lastPlayedTimestamp = Number(instantStats?.lastPlayedAt || (app as any)?.rt_last_time_played || 0);
	const lastPlayedText = lastPlayedTimestamp > 0 ? formatLastPlayedDate(lastPlayedTimestamp) : '';

	const screen = doc.createElement('div');
	screen.id = 'gdl-bp-achievements-screen';
	screen.className = 'gdl-bp-ach-screen';

	let activeTab: 'mine' | 'global' = 'mine';
	let searchQuery = '';

	const renderListItems = (items: LocalAchievementItem[]): string => {
		const filtered = items.filter(a => {
			if (!searchQuery) return true;
			const q = searchQuery.toLowerCase();
			return (a.display_name || a.name || '').toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q);
		});

		if (filtered.length === 0) {
			return `<div class="gdl-bp-ach-empty">${escapeHtml(gdlText('no_achievements_match', 'No achievements match your search.'))}</div>`;
		}

		return filtered.map(item => {
			const isEarned = Boolean(item.earned);
			const iconUrl = isEarned ? item.icon : (item.icon_gray || item.icon);
			const unlockDateStr = isEarned && item.earned_time ? formatUnlockDate(item.earned_time) : '';
			const globalPct = typeof item.global_percent === 'number' ? item.global_percent.toFixed(1) : null;

			return `
				<div class="gdl-bp-ach-row Focusable ${isEarned ? 'is-earned' : 'is-locked'}" tabindex="0" role="button" data-focusable="true">
					<div class="gdl-bp-ach-row-icon-frame">
						<img class="gdl-bp-ach-row-icon ${!isEarned ? 'is-locked' : ''}" src="${escapeHtml(iconUrl)}" alt="" />
					</div>
					<div class="gdl-bp-ach-row-body">
						<div class="gdl-bp-ach-row-title">${escapeHtml(item.display_name || item.name)}</div>
						<div class="gdl-bp-ach-row-desc">${escapeHtml(item.description || '')}</div>
						${globalPct ? `<div class="gdl-bp-ach-row-global">${globalPct}% ${escapeHtml(gdlText('players_have_achievement', 'de los jugadores tienen este logro'))}</div>` : ''}
					</div>
					<div class="gdl-bp-ach-row-status">
						${isEarned && unlockDateStr ? `<div class="gdl-bp-ach-row-unlocked-at">${escapeHtml(loc('AppDetails_Achievement_UnlockedAt', 'Se desbloqueó el %1$s').replace('%1$s', unlockDateStr))}</div><div class="gdl-bp-ach-row-bar-done"></div>` : ''}
						${!isEarned ? `<div class="gdl-bp-ach-row-locked-badge">${escapeHtml(loc('AppDetails_Achievement_Locked', 'Bloqueado'))}</div>` : ''}
					</div>
				</div>
			`;
		}).join('');
	};

	const getSortedAchievements = (): LocalAchievementItem[] => {
		const list = [...(achievements.achievements || [])];
		if (activeTab === 'mine') {
			// Earned first, then by unlock time descending
			return list.sort((a, b) => {
				if (a.earned && !b.earned) return -1;
				if (!a.earned && b.earned) return 1;
				return Number(b.earned_time || 0) - Number(a.earned_time || 0);
			});
		} else {
			// Global percentage descending
			return list.sort((a, b) => Number(b.global_percent || 0) - Number(a.global_percent || 0));
		}
	};

	screen.innerHTML = `
		<div class="gdl-bp-ach-screen-inner">
			<!-- Header -->
			<div class="gdl-bp-ach-screen-header">
				${portraitUrl ? `<img class="gdl-bp-ach-screen-portrait" src="${escapeHtml(portraitUrl)}" alt="" />` : ''}
				<div class="gdl-bp-ach-screen-header-info">
					<h1 class="gdl-bp-ach-screen-game-title">${escapeHtml(gameName)}</h1>
					<div class="gdl-bp-ach-screen-progress-wrap">
						<div class="gdl-bp-ach-screen-medal ${isAllUnlocked ? 'is-complete' : ''}">${medalSvg()}</div>
						<div class="gdl-bp-ach-screen-progress-text">
							<span class="gdl-bp-ach-screen-progress-headline">
								${isAllUnlocked ? escapeHtml(loc('AppDetails_AchievementsUnlockedAll', '¡HAS DESBLOQUEADO TODOS LOS LOGROS!')) : escapeHtml(loc('AppDetails_SectionTitle_Achievements', 'LOGROS DESBLOQUEADOS'))}
								<strong>${unlocked}/${total}</strong>
								<span class="gdl-bp-ach-screen-pct">(${pct}%)</span>
							</span>
							<div class="gdl-bp-ach-screen-progress-track">
								<div class="gdl-bp-ach-screen-progress-fill" style="width: ${pct}%;"></div>
							</div>
						</div>
						${playtimeText ? `
							<div class="gdl-bp-ach-screen-stat-meta">
								<div class="gdl-bp-ach-screen-stat-item">
									<span class="gdl-bp-ach-screen-stat-label">${escapeHtml(loc('AppDetails_SectionTitle_Playtime', 'TIEMPO DE JUEGO').toUpperCase())}</span>
									<span class="gdl-bp-ach-screen-stat-val">${escapeHtml(playtimeText)}</span>
								</div>
								${lastPlayedText ? `
									<div class="gdl-bp-ach-screen-stat-item">
										<span class="gdl-bp-ach-screen-stat-label">${escapeHtml(loc('AppDetails_SectionTitle_LastSession', 'ÚLTIMA SESIÓN').toUpperCase())}</span>
										<span class="gdl-bp-ach-screen-stat-val">${escapeHtml(lastPlayedText)}</span>
									</div>
								` : ''}
							</div>
						` : ''}
					</div>
				</div>
			</div>

			<!-- Tabs row -->
			<div class="gdl-bp-ach-screen-tabs">
				<button class="gdl-bp-ach-tab-btn Focusable active" data-tab="mine" tabindex="0" role="button" data-focusable="true">
					${escapeHtml(loc('AppDetails_MyAchievements', 'MIS LOGROS'))}
				</button>
				<button class="gdl-bp-ach-tab-btn Focusable" data-tab="global" tabindex="0" role="button" data-focusable="true">
					${escapeHtml(loc('AppDetails_GlobalAchievements', 'LOGROS MUNDIALES'))}
				</button>
			</div>

			<!-- Toolbar -->
			<div class="gdl-bp-ach-screen-toolbar">
				<div class="gdl-bp-ach-search-wrap">
					<input class="gdl-bp-ach-search-input Focusable" type="text" placeholder="${escapeHtml(loc('Search', 'Buscar...'))}" tabindex="0" data-focusable="true" />
				</div>
			</div>

			<!-- List -->
			<div class="gdl-bp-ach-screen-list">
				${renderListItems(getSortedAchievements())}
			</div>

			<!-- Bottom prompt bar -->
			<div class="gdl-bp-ach-screen-footer">
				<div class="gdl-bp-footer-prompt">
					<span class="gdl-bp-key-badge">A</span>
					<span>${escapeHtml(loc('Button_Select', 'SELECCIONAR'))}</span>
				</div>
				<div class="gdl-bp-footer-prompt gdl-bp-ach-close-trigger">
					<span class="gdl-bp-key-badge">B</span>
					<span>${escapeHtml(loc('Button_Back', 'VOLVER'))}</span>
				</div>
			</div>
		</div>
	`;

	doc.body.appendChild(screen);

	const listContainer = screen.querySelector<HTMLElement>('.gdl-bp-ach-screen-list')!;
	const searchInput = screen.querySelector<HTMLInputElement>('.gdl-bp-ach-search-input')!;
	const tabs = screen.querySelectorAll<HTMLButtonElement>('.gdl-bp-ach-tab-btn');

	const refreshList = () => {
		listContainer.innerHTML = renderListItems(getSortedAchievements());
	};

	tabs.forEach(btn => {
		btn.addEventListener('click', () => {
			tabs.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');
			activeTab = (btn.dataset.tab as 'mine' | 'global') || 'mine';
			refreshList();
		});
	});

	searchInput.addEventListener('input', () => {
		searchQuery = searchInput.value.trim();
		refreshList();
	});

	const closeScreen = () => {
		doc.removeEventListener('keydown', onKeyDown, true);
		screen.remove();
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27) {
			e.preventDefault();
			e.stopPropagation();
			closeScreen();
		}
	};

	doc.addEventListener('keydown', onKeyDown, true);
	screen.querySelector('.gdl-bp-ach-close-trigger')?.addEventListener('click', closeScreen);

	// Focus initial element
	const firstFocus = screen.querySelector<HTMLElement>('.gdl-bp-ach-tab-btn.active, .gdl-bp-ach-row');
	if (firstFocus) {
		firstFocus.focus();
		firstFocus.classList.add('gpfocus');
	}
}
