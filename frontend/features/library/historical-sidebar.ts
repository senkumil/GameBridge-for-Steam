import type { SteamGameData } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText, loc } from '../../steam/localization';
import type { NativeLibraryLayout } from './layout';
import { buildNativeSidebarSection } from './layout';
import { legacyGameRecord, type ExternalAchievementSet, type LegacyGameRecord } from './legacy-games';
import type { SteamLibraryAssets } from './artwork';
import { steamStringList } from '../../core/steam-game-data';

function infoRow(label: string, value: string): string {
	return `<div class="gdl-historical-info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function appInfoGenre(genreIds?: string[]): string {
	const labels: Record<string, string> = {
		'1': 'Acción', '2': 'Estrategia', '3': 'Rol', '4': 'Indie', '9': 'Carreras',
		'18': 'Deportes', '23': 'Casual', '25': 'Aventura', '28': 'Simulación', '29': 'Multijugador masivo',
	};
	return (genreIds || []).map(id => labels[String(id)] || '').find(Boolean) || '';
}

function historicalInfoBody(data: SteamGameData, steamAppId: string, record?: LegacyGameRecord | null, modern?: SteamLibraryAssets | null): string {
	const developer = record?.developer || steamStringList(data.developers).join(', ') || steamStringList(modern?.developers).join(', ') || '';
	const publisher = record?.publisher || steamStringList(data.publishers).join(', ') || steamStringList(modern?.publishers).join(', ') || '';
	const genre = record?.genre() || (Array.isArray(data.genres) ? data.genres : []).map(item => item.description).join(', ') || appInfoGenre(steamStringList(modern?.genre_ids));
	const release = record?.steamRelease || data.release_date?.date || modern?.release_date || '';
	const controller = record?.controllerSupport === 'partial'
		? gdlText('partial_controller', 'Partial controller support')
		: record?.controllerSupport === 'full' ? gdlText('full_controller', 'Full controller support')
		: modern?.controller_support === 'partial' ? gdlText('partial_controller', 'Partial controller support')
		: modern?.controller_support === 'full' ? gdlText('full_controller', 'Full controller support') : '';
	const rows = [
		developer && infoRow(loc('AppDetails_Developer', gdlText('developer', 'Developer')), developer),
		publisher && infoRow(loc('AppDetails_Publisher', gdlText('publisher', 'Publisher')), publisher),
		genre && infoRow(gdlText('genre_label', 'Genre'), genre),
		release && infoRow(gdlText('steam_release_label', 'Steam release'), release),
		controller && infoRow(gdlText('controller_support_label', 'Controller support'), controller),
		record?.metacritic !== undefined && infoRow('Metacritic', String(record.metacritic)),
		infoRow('Steam AppID', steamAppId),
	].filter(Boolean).join('');
	const storeUrl = `https://store.steampowered.com/app/${steamAppId}`;
	return `<div class="gdl-native-sidebar-panel gdl-historical-info-card">
		<div class="gdl-historical-info-rows">${rows}</div>
		<a class="gdl-historical-footer-link" href="${storeUrl}" data-gdl-open-url="${storeUrl}">${escapeHtml(gdlText('store_page', 'Store page'))}</a>
	</div>`;
}

function externalAchievementsBody(sets: ExternalAchievementSet[]): string {
	const cards = sets.map(set => {
		const countLabel = set.platform === 'xbox'
			? gdlText('external_achievements_total', '{count} achievements', { count: set.total })
			: gdlText('external_trophies_total', '{count} trophies', { count: set.total });
		return `<a class="gdl-external-achievement-card is-${set.platform}" href="${escapeHtml(set.url)}" data-gdl-open-url="${escapeHtml(set.url)}">
			<span class="gdl-external-platform-mark">${set.platform === 'xbox' ? 'X' : 'PS'}</span>
			<span class="gdl-external-platform-copy"><strong>${escapeHtml(set.platformLabel)}</strong><span>${escapeHtml(countLabel)} · ${escapeHtml(set.summary())}</span><small>${escapeHtml(set.detail())}</small></span>
			<span class="gdl-external-card-arrow" aria-hidden="true">›</span>
		</a>`;
	}).join('');
	return `<div class="gdl-native-sidebar-panel gdl-external-achievements-card">${cards}</div>`;
}

export function buildHistoricalSidebarSections(
	doc: Document,
	layout: NativeLibraryLayout,
	data: SteamGameData,
	steamAppId: string,
	modern?: SteamLibraryAssets | null,
): HTMLElement[] {
	// This sidebar is a recovery surface for games whose original Store page is
	// gone. Active Steam AppIDs already expose their normal Store metadata and
	// must not receive a second "Information" panel merely because they were
	// launched through a non-Steam shortcut.
	if (data.is_delisted !== true) return [];
	const record = legacyGameRecord(steamAppId, data);
	const sections: HTMLElement[] = [];
	const info = buildNativeSidebarSection(doc, layout, {
		sectionId: 'gdl-historical-info-section', headerText: gdlText('information', 'Information'),
		innerId: 'gdl-historical-info-content', innerHtml: historicalInfoBody(data, steamAppId, record, modern), cloneInnerClass: false,
	});
	if (info) sections.push(info);
	if (record?.externalAchievements.length) {
		const external = buildNativeSidebarSection(doc, layout, {
			sectionId: 'gdl-external-achievements-section', headerText: gdlText('other_platform_achievements', 'Achievements on other platforms'),
			innerId: 'gdl-external-achievements-content', innerHtml: externalAchievementsBody(record.externalAchievements), cloneInnerClass: false,
		});
		if (external) sections.push(external);
	}
	return sections;
}
