import type { LocalAchievementData, LocalAchievementItem } from '../../domain/types';
import { escapeHtml, escapeAttr } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import { formatLastPlayedDate, formatPlaytimeMinutes } from '../playtime/format';
import { formatLocalUnlockDate } from '../achievements/format';
import { getInstantPlaytimeStats } from '../playtime/service';
import { getShortcutAppById } from '../../steam/shortcuts';
import { ensureBigPictureModalStyles } from './modal-styles';
import { completionMedal } from './achievement-cards';

export function openBigPictureAchievementsScreen(
	doc: Document,
	achievements: LocalAchievementData,
	gameName: string,
	portraitUrl: string,
	shortcutAppId?: number,
	backgroundUrl?: string,
): void {
	doc.getElementById('gdl-bp-achievements-screen')?.remove();
	if (!doc.body) return;

	ensureBigPictureModalStyles(doc);

	const prevActiveElement = (doc.activeElement as HTMLElement | null) || null;

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
	screen.style.cssText = 'position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:9999999!important;background:#0e141b!important;overflow-y:auto!important;box-sizing:border-box!important;';

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
			const unlockDateStr = isEarned && item.earned_time ? formatLocalUnlockDate(item.earned_time) : '';
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
		${backgroundUrl ? `<div class="gdl-bp-ach-screen-backdrop" style="background-image: url('${escapeAttr(backgroundUrl)}');"></div>` : ''}
		<div class="gdl-bp-ach-screen-inner">
			<!-- Header -->
			<div class="gdl-bp-ach-screen-header">
				${portraitUrl ? `<img class="gdl-bp-ach-screen-portrait" src="${escapeHtml(portraitUrl)}" alt="" />` : ''}
				<div class="gdl-bp-ach-screen-header-info">
					<h1 class="gdl-bp-ach-screen-game-title">${escapeHtml(gameName)}</h1>
					<div class="gdl-bp-ach-screen-progress-wrap">
						<div class="gdl-bp-ach-screen-progress-top-row">
							<div class="gdl-bp-ach-screen-progress-headline">
								${isAllUnlocked ? `<div class="gdl-bp-ach-screen-medal is-complete">${completionMedal()}</div>` : ''}
								<span>${isAllUnlocked ? escapeHtml(loc('AppDetails_AchievementsUnlockedAll', '¡HAS DESBLOQUEADO TODOS LOS LOGROS!')) : escapeHtml(loc('AppDetails_SectionTitle_Achievements', 'LOGROS DESBLOQUEADOS'))} <strong>${unlocked}/${total}</strong> <span class="gdl-bp-ach-screen-pct">(${pct}%)</span></span>
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
						<div class="gdl-bp-ach-screen-progress-track">
							<div class="gdl-bp-ach-screen-progress-fill" style="width: ${pct}%;"></div>
						</div>
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
					<input class="gdl-bp-ach-search-input Focusable" type="text" placeholder="${escapeHtml(loc('Search', 'Buscar'))}" tabindex="0" data-focusable="true" />
				</div>
				<div class="gdl-bp-ach-compare-wrap">
					<button class="gdl-bp-ach-compare-btn Focusable" type="button" tabindex="0" data-focusable="true">
						<span>${escapeHtml(loc('AppDetails_CompareWith', 'Comparar con...'))}</span>
						<span class="gdl-bp-ach-caret">▼</span>
					</button>
				</div>
			</div>

			<!-- List -->
			<div class="gdl-bp-ach-screen-list">
				${renderListItems(getSortedAchievements())}
			</div>

			<!-- Bottom prompt bar -->
			<div class="gdl-bp-ach-screen-footer">
				<div class="gdl-bp-ach-screen-footer-left">
					<div class="gdl-bp-footer-prompt">
						<span class="gdl-bp-xbox-icon" aria-hidden="true">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.88 15.65c-.32.22-.72.35-1.15.35-.61 0-1.18-.27-1.57-.71l-1.16-1.32-1.16 1.32c-.39.44-.96.71-1.57.71-.43 0-.83-.13-1.15-.35 1.13-1.15 2.5-2.07 4.04-2.65 1.54.58 2.91 1.5 4.04 2.65zm1.75-2.82c-.89-.92-1.99-1.67-3.23-2.18 1.4-.73 2.59-1.78 3.44-3.08.31.86.48 1.79.48 2.76 0 .89-.25 1.74-.69 2.5zm-11.26 0c-.44-.76-.69-1.61-.69-2.5 0-.97.17-1.9.48-2.76.85 1.3 2.04 2.35 3.44 3.08-1.24.51-2.34 1.26-3.23 2.18zM12 11.23c-1.5 0-2.85-.68-3.76-1.76.99-1.23 2.31-2.14 3.76-2.67 1.45.53 2.77 1.44 3.76 2.67-.91 1.08-2.26 1.76-3.76 1.76z"/>
							</svg>
						</span>
						<span>${escapeHtml(loc('Button_Menu', 'MENÚ'))}</span>
					</div>
				</div>
				<div class="gdl-bp-ach-screen-footer-right">
					<div class="gdl-bp-footer-prompt">
						<span class="gdl-bp-key-badge badge-a">A</span>
						<span>${escapeHtml(loc('Button_Select', 'SELECCIONAR'))}</span>
					</div>
					<div class="gdl-bp-footer-prompt gdl-bp-ach-close-trigger">
						<span class="gdl-bp-key-badge badge-b">B</span>
						<span>${escapeHtml(loc('Button_Back', 'VOLVER'))}</span>
					</div>
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
		if (prevActiveElement && prevActiveElement.isConnected) {
			prevActiveElement.focus();
			prevActiveElement.classList.add('gpfocus');
		}
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
