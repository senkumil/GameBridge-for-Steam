import React from 'react';
import type { LocalAchievementData, SteamGameData } from '../../../domain/types';
import { steamStringList } from '../../../core/steam-game-data';
import { steamGameMainPageUrl } from '../../../core/steam-links';
import { gdlText, loc } from '../../../steam/localization';
import { linkedShortcutPortrait } from '../../library/artwork';
import { featureSvg } from '../news-modal';

export interface BigPictureInfoTabProps {
	shortcut: { id: number; title: string; steamAppId: string };
	data: {
		game: SteamGameData | null;
		achievements: LocalAchievementData | null;
	};
}

function hasCategory(game: SteamGameData | null, id: number): boolean {
	return Boolean(Array.isArray(game?.categories) && game.categories.some(category => Number(category.id) === id));
}

export const BigPictureInfoTab: React.FC<BigPictureInfoTabProps> = ({ shortcut, data }) => {
	const game = data.game;
	if (!game) {
		return <div className="gdl-bp-empty">{loc('AppDetails_GameInfo', 'Game information')}</div>;
	}

	const developer = steamStringList(game.developers).join(', ');
	const publisher = steamStringList(game.publishers).join(', ');
	const franchise = steamStringList(game.franchises).join(', ');
	const release = game.release_date?.date || '';
	const portrait = linkedShortcutPortrait(shortcut.id, shortcut.steamAppId)
		|| (shortcut.steamAppId ? `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${shortcut.steamAppId}/library_600x900_2x.jpg` : '')
		|| game.capsule_image || game.header_image || '';

	const metaLabel = (key: string, fb: string) => loc(key, fb).replace(/[:\s]+$/g, '').trim() + ':';

	const features: Array<{ icon: 'person' | 'achievement' | 'cloud' | 'family' | 'controller'; label: string }> = [];
	if (hasCategory(game, 2) || !hasCategory(game, 1)) {
		features.push({ icon: 'person', label: loc('AppDetails_Feature_SinglePlayer', gdlText('single_player', 'Single-player')) });
	}
	if ((data.achievements?.total || game.achievements?.total || 0) > 0) {
		features.push({ icon: 'achievement', label: loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements')) });
	}
	features.push(
		{ icon: 'cloud', label: loc('AppDetails_Feature_SteamCloud', gdlText('cloud_saves', 'Cloud saves')) },
		{ icon: 'family', label: loc('AppDetails_Feature_FamilySharing', gdlText('family_sharing', 'Family Sharing')) },
		{ icon: 'controller', label: loc('AppDetails_Feature_FullController', gdlText('full_controller', 'Full controller support')) }
	);

	const links: [string, string][] = [
		[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), steamGameMainPageUrl(shortcut.steamAppId, game.is_delisted === true)],
		[loc('AppDetails_Links_DLC', gdlText('dlc_links', 'DLC')), `https://store.steampowered.com/dlc/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Links_PointsShop', gdlText('points_shop', 'Points Shop')), `https://store.steampowered.com/points/shop/app/${shortcut.steamAppId}`],
		[loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${shortcut.steamAppId}/discussions/`],
		[loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${shortcut.steamAppId}/guides/`],
		[loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${shortcut.steamAppId}`]
	];

	return (
		<section className="gdl-bp-section">
			<div className="gdl-bp-info-grid">
				<img className="gdl-bp-info-portrait" src={portrait} alt="" />
				<div>
					<div className="gdl-bp-info-description">{game.short_description || ''}</div>
					<div className="gdl-bp-info-meta">
						{developer ? (
							<>
								{metaLabel('AppDetails_Developer', gdlText('developer', 'Developer'))} <strong>{developer}</strong><br />
							</>
						) : null}
						{publisher ? (
							<>
								{metaLabel('AppDetails_Publisher', gdlText('publisher', 'Publisher'))} <strong>{publisher}</strong><br />
							</>
						) : null}
						{franchise ? (
							<>
								{metaLabel('AppDetails_Franchise', gdlText('franchise', 'Franchise'))} <strong>{franchise}</strong><br />
							</>
						) : null}
						{release ? (
							<>
								<br />
								{metaLabel('AppDetails_ReleaseDate', gdlText('release_date', 'Release date'))} <strong>{release}</strong>
							</>
						) : null}
					</div>
				</div>
				<div>
					{features.map(feature => (
						<div key={feature.label} className="gdl-bp-feature">
							<span dangerouslySetInnerHTML={{ __html: featureSvg(feature.icon) }} />
							<span>{feature.label}</span>
						</div>
					))}
				</div>
			</div>
			<div className="gdl-bp-info-links">
				{links.map(([label, url]) => (
					<a
						key={label}
						className="gdl-bp-info-link Focusable"
						href={url}
						data-gdl-bp-external="1"
						tabIndex={0}
						role="button"
						data-focusable="true"
					>
						{label}
					</a>
				))}
			</div>
		</section>
	);
};
