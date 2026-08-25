import type { NativeGameFeature, NativeGameFeatureKind, NativeGameInfo, SteamGameData } from '../../domain/types';
import type { SteamLibraryAssets } from './artwork';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import { stripTags } from './news';

function nativeFeature(key: string, kind: NativeGameFeatureKind, label: string, categoryId?: number): NativeGameFeature {
	return { key, kind, label, categoryId };
}

/** Map language-independent Store category IDs to semantic native-library features. */
function mapNativeFeature(categoryId?: number): NativeGameFeature | null {
	switch (Number(categoryId)) {
		case 2: return nativeFeature('category:2', 'single-player', loc('AppDetails_Feature_SinglePlayer', gdlText('single_player', 'Single-player')), 2);
		case 1: return nativeFeature('category:1', 'multiplayer', loc('AppDetails_Feature_MultiPlayer', gdlText('multi_player', 'Multi-player')), 1);
		case 9:
		case 38: return nativeFeature(`category:${categoryId}`, 'coop', loc('AppDetails_Feature_CoOp', gdlText('cooperative', 'Co-op')), categoryId);
		case 22: return nativeFeature('category:22', 'achievements', loc('AppDetails_Feature_SteamAchievements', gdlText('achievements_label', 'Achievements')), 22);
		case 23: return nativeFeature('category:23', 'cloud', loc('AppDetails_Feature_SteamCloud', gdlText('cloud_saves', 'Cloud saves')), 23);
		case 28: return nativeFeature('category:28', 'controller-full', loc('AppDetails_Feature_FullController', gdlText('full_controller', 'Full controller support')), 28);
		case 18: return nativeFeature('category:18', 'controller-partial', loc('AppDetails_Feature_PartialController', gdlText('partial_controller', 'Partial controller support')), 18);
		case 30: return nativeFeature('category:30', 'workshop', loc('AppDetails_Feature_SteamWorkshop', 'Steam Workshop'), 30);
		case 44: return nativeFeature('category:44', 'remote-play', loc('AppDetails_Feature_RemotePlayTogether', 'Remote Play Together'), 44);
		case 62: return nativeFeature('category:62', 'family-sharing', loc('AppDetails_Feature_FamilySharing', gdlText('family_sharing', 'Family Sharing')), 62);
		default: return null;
	}
}

function uniqueNativeFeatures(values: NativeGameFeature[]): NativeGameFeature[] {
	const seen = new Set<string>();
	return values.filter(feature => {
		const key = feature.key || feature.kind;
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return Boolean(feature.label);
	}).slice(0, 7);
}

function formatNativeRelease(value: string): string {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
		if (match) {
			const localDate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
			return new Intl.DateTimeFormat(steamIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(localDate);
		}
	} catch {}
	// Store appdetails already localizes non-ISO release strings using Steam language.
	return raw;
}

export function steamNativeGameInfo(data: SteamGameData, steamAppId: string, modern?: SteamLibraryAssets | null): NativeGameInfo {
	const features = (data.categories || [])
		.map(category => mapNativeFeature(category.id))
		.filter((feature): feature is NativeGameFeature => Boolean(feature));
	const hasCloud = (data.categories || []).some(category => Number(category.id) === 23);
	if ((data.achievements?.total || 0) > 0 && !features.some(feature => feature.kind === 'achievements')) {
		features.push(nativeFeature('derived:achievements', 'achievements', loc('AppDetails_Feature_SteamAchievements', gdlText('achievements_label', 'Achievements'))));
	}
	if (hasCloud && !features.some(feature => feature.kind === 'cloud')) {
		features.push(nativeFeature('derived:cloud', 'cloud', loc('AppDetails_Feature_SteamCloud', gdlText('cloud_saves', 'Cloud saves'))));
	}
	if (data.controller_support === 'full' && !features.some(feature => feature.kind === 'controller-full')) {
		features.push(nativeFeature('derived:controller-full', 'controller-full', loc('AppDetails_Feature_FullController', gdlText('full_controller', 'Full controller support'))));
	} else if (data.controller_support === 'partial' && !features.some(feature => feature.kind === 'controller-partial')) {
		features.push(nativeFeature('derived:controller-partial', 'controller-partial', loc('AppDetails_Feature_PartialController', gdlText('partial_controller', 'Partial controller support'))));
	}
	return {
		key: steamAppId,
		title: data.name || '',
		portrait: modern?.portrait || data.capsule_imagev5 || data.capsule_image || data.header_image || '',
		description: stripTags(data.short_description || data.about_the_game || data.detailed_description || '').replace(/\s+/g, ' '),
		developer: (data.developers || []).join(', '),
		publisher: (data.publishers || []).join(', '),
		franchise: modern?.franchise || (data.franchises || []).join(', ') || '',
		release: formatNativeRelease(data.release_date?.date || ''),
		features: uniqueNativeFeatures(features),
		hasCloud,
	};
}
