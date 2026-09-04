import React, { Component, type ReactNode } from 'react';
import {
	DialogButton,
	Field,
	Focusable,
	PanelSection,
	PanelSectionRow,
	ProgressBar,
	Spinner,
} from '@steambrew/client';
import { backendLog } from '../../api/backend';
import { steamStringList } from '../../core/steam-game-data';
import { steamGameMainPageUrl } from '../../core/steam-links';
import type { CommunityContentItem, FriendPlayInfo, NewsItem } from '../../domain/types';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import { steamWebpackRuntime } from '../../steam/modules/SteamWebpackRuntime';
import { eventTypeLabel, newsExcerpt } from '../library/news';
import { loadLocalActivityPosts } from '../library/social/feed';
import { getCachedPersona } from '../library/social/personas';
import type { BigPictureDetailData, BigPictureTab, MappedShortcut } from './types';

type NativeComponent = React.ComponentType<any>;

const NativeSection = PanelSection as NativeComponent;
const NativeRow = PanelSectionRow as NativeComponent;
const NativeField = Field as NativeComponent;
const NativeFocusable = Focusable as NativeComponent;
const NativeButton = DialogButton as NativeComponent;
const NativeProgress = ProgressBar as NativeComponent;
const NativeSpinner = Spinner as NativeComponent;

interface NativeDetailsProps {
	tab: BigPictureTab;
	shortcut: MappedShortcut;
	data: BigPictureDetailData;
	hydrating: boolean;
	document: Document;
}

interface BoundaryState {
	failed: boolean;
}

class NativeDetailsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, BoundaryState> {
	state: BoundaryState = { failed: false };

	static getDerivedStateFromError(): BoundaryState {
		return { failed: true };
	}

	componentDidCatch(error: Error): void {
		backendLog(`[NGL][Gamepad] Native Big Picture section failed: ${error.message}`);
	}

	render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

function plainText(value: unknown, maxLength = 360): string {
	const text = String(value || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\[[^\]]+\]/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function openExternal(doc: Document, url: string): void {
	if (!url) return;
	try {
		const win = doc.defaultView as any;
		const system = win?.SteamClient?.System || (window as any)?.SteamClient?.System;
		if (typeof system?.OpenInSystemBrowser === 'function') {
			system.OpenInSystemBrowser(url);
			return;
		}
		doc.defaultView?.open(url, '_blank');
	} catch {}
}

function LoadingRow({ hydrating, empty }: { hydrating: boolean; empty: string }): React.ReactElement {
	return (
		<NativeRow>
			{hydrating && NativeSpinner ? <NativeSpinner /> : <NativeField label={empty} />}
		</NativeRow>
	);
}

function NativeItem({
	label,
	description,
	icon,
	onActivate,
}: {
	label: ReactNode;
	description?: ReactNode;
	icon?: ReactNode;
	onActivate?: () => void;
}): React.ReactElement {
	const activate = onActivate ? () => onActivate() : undefined;
	const activationProps = activate ? { onActivate: activate, onClick: activate } : {};
	return (
		<NativeRow>
			<NativeField
				label={label}
				description={description}
				icon={icon}
				focusable={Boolean(activate)}
				highlightOnFocus={Boolean(activate)}
				{...activationProps}
			/>
		</NativeRow>
	);
}

function friendLabel(friend: FriendPlayInfo): string {
	return getCachedPersona(friend.steamid)?.name || friend.steamid;
}

function FriendsSection({ data }: Pick<NativeDetailsProps, 'data'>): React.ReactElement {
	const played = [...(data.friends?.recentlyPlayed || []), ...(data.friends?.previouslyPlayed || [])];
	const wishlisted = data.friends?.wishlisted || [];
	return (
		<NativeSection title={loc('AppDetails_Friends_Title', 'Amigos')}>
			{played.length > 0 ? played.slice(0, 12).map(friend => (
				<NativeItem
					key={`played-${friend.steamid}`}
					label={friendLabel(friend)}
					description={loc('AppDetails_Friends_PlayedPreviously_Header', 'Jugado anteriormente')}
				/>
			)) : null}
			{wishlisted.length > 0 ? wishlisted.slice(0, 12).map(friend => (
				<NativeItem
					key={`wish-${friend.steamid}`}
					label={friendLabel(friend)}
					description={loc('AppDetails_Friends_OnWishlist', 'En su lista de deseados')}
				/>
			)) : null}
			{played.length === 0 && wishlisted.length === 0 ? (
				<NativeItem label={loc('AppDetails_Friends_None', 'No hay actividad de amigos para este juego.')} />
			) : null}
		</NativeSection>
	);
}

function newsDescription(item: NewsItem): string {
	const date = Number(item.date || 0) > 0
		? new Date(Number(item.date) * 1000).toLocaleDateString(steamIntlLocale())
		: '';
	const kind = item.event_type ? eventTypeLabel(Number(item.event_type)) : (item.feedlabel || gdlText('feed_news', 'News'));
	return [kind, date, newsExcerpt(item.contents || '', 220)].filter(Boolean).join(' · ');
}

function ActivityTab(props: NativeDetailsProps): React.ReactElement {
	const posts = loadLocalActivityPosts(props.shortcut.steamAppId, String(props.shortcut.id));
	const news = [...props.data.news].filter(item => item?.title).sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
	return (
		<>
			<FriendsSection data={props.data} />
			<NativeSection title={loc('AppDetails_SectionTitle_Activity', 'Actividad')}>
				{posts.slice(0, 8).map(post => (
					<NativeItem key={post.id} label={post.user_name || gdlText('user_status', 'Status post')} description={post.text} />
				))}
				{news.slice(0, 16).map(item => (
					<NativeItem
						key={item.gid || item.url || item.title}
						label={item.title}
						description={newsDescription(item)}
						onActivate={item.url ? () => openExternal(props.document, item.url) : undefined}
					/>
				))}
				{posts.length === 0 && news.length === 0 ? (
					<LoadingRow hydrating={props.hydrating} empty={gdlText('no_recent_activity', 'No recent activity.')} />
				) : null}
			</NativeSection>
		</>
	);
}

function AchievementsSection({ data, hydrating }: Pick<NativeDetailsProps, 'data' | 'hydrating'>): React.ReactElement {
	const achievements = data.achievements;
	const total = Math.max(0, Number(achievements?.total || data.game?.achievements?.total || 0));
	const unlocked = Math.max(0, Math.min(total, Number(achievements?.unlocked || 0)));
	const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
	return (
		<NativeSection title={loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements'))}>
			{total > 0 ? (
				<>
					<NativeItem label={gdlText('achievements_unlocked', '{unlocked} of {total} achievements unlocked', { unlocked, total })} description={`${percent}%`} />
					<NativeRow><NativeProgress nProgress={percent / 100} /></NativeRow>
					{(achievements?.achievements || []).slice(0, 24).map(item => (
						<NativeItem
							key={item.name}
							label={item.display_name || item.name}
							description={item.earned ? (item.description || loc('Achievement_Earned', 'Unlocked')) : (item.description || gdlText('hidden_achievement_desc', 'Keep playing to unlock this achievement.'))}
							icon={item.icon ? <img src={item.earned ? item.icon : (item.icon_gray || item.icon)} alt="" /> : undefined}
						/>
					))}
				</>
			) : <LoadingRow hydrating={hydrating} empty={gdlText('no_achievements', 'No achievements found.')} />}
		</NativeSection>
	);
}

function StuffTab(props: NativeDetailsProps): React.ReactElement {
	const cards = props.data.cards?.cards || [];
	return (
		<>
			<AchievementsSection data={props.data} hydrating={props.hydrating} />
			<NativeSection title={loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Trading cards'))}>
				{cards.length > 0 ? cards.slice(0, 18).map((card, index) => (
					<NativeItem key={`${card.title}-${index}`} label={card.title || `${gdlText('trading_cards', 'Trading card')} ${index + 1}`} icon={card.image ? <img src={card.image} alt="" /> : undefined} />
				)) : <LoadingRow hydrating={props.hydrating} empty={loc('AppDetails_NoTradingCards', 'Este juego no tiene cromos disponibles.')} />}
			</NativeSection>
			<NativeSection title={loc('AppDetails_SectionTitle_Media', 'Contenido multimedia')}>
				<NativeItem label={loc('AppDetails_ScreenshotHint_Gamepad', 'Puedes tomar capturas mientras juegas desde la superposición de Steam.')} />
			</NativeSection>
			<NativeSection title={loc('AppDetails_SectionTitle_GameNotes', 'Notas')}>
				<NativeItem label={loc('AppDetails_CreateNewNote', 'Crea y consulta notas desde la superposición de Steam.')} />
			</NativeSection>
		</>
	);
}

function communityItems(data: BigPictureDetailData): CommunityContentItem[] {
	if (data.community.length > 0) return data.community;
	return (data.game?.screenshots || []).map((shot, index) => ({
		type: 'screenshot',
		image: shot.path_full || shot.path_thumbnail,
		title: `${loc('AppDetails_Community_Screenshot', 'Captura')} ${index + 1}`,
	}));
}

function CommunityTab(props: NativeDetailsProps): React.ReactElement {
	const items = communityItems(props.data).filter(item => item.title || item.image);
	return (
		<NativeSection title={loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Community content'))}>
			{items.length > 0 ? items.slice(0, 24).map((item, index) => (
				<NativeItem
					key={`${item.type}-${item.title}-${index}`}
					label={item.title || item.label || loc('AppDetails_Community_Screenshot', 'Contenido de la comunidad')}
					description={[item.author_name, plainText(item.description, 180)].filter(Boolean).join(' · ')}
					icon={item.image ? <img src={item.image} alt="" /> : undefined}
					onActivate={item.link ? () => openExternal(props.document, item.link!) : undefined}
				/>
			)) : <LoadingRow hydrating={props.hydrating} empty={loc('AppDetails_Community_NoContent', 'No hay contenido de la comunidad disponible.')} />}
		</NativeSection>
	);
}

function InfoTab(props: NativeDetailsProps): React.ReactElement {
	const game = props.data.game;
	const developer = steamStringList(game?.developers).join(', ');
	const publisher = steamStringList(game?.publishers).join(', ');
	const franchise = steamStringList(game?.franchises).join(', ');
	const genres = (game?.genres || []).map(genre => genre.description).filter(Boolean).join(', ');
	const categories = (game?.categories || []).map(category => category.description).filter(Boolean);
	const links: Array<[string, string]> = [
		[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), steamGameMainPageUrl(props.shortcut.steamAppId, game?.is_delisted === true)],
		[loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${props.shortcut.steamAppId}`],
		[loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${props.shortcut.steamAppId}/discussions/`],
		[loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${props.shortcut.steamAppId}/guides/`],
		[loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${props.shortcut.steamAppId}`],
	];
	const linkActivation = (url: string): Record<string, () => void> => ({
		onActivate: () => openExternal(props.document, url),
	});
	const linkClick = (url: string): Record<string, () => void> => ({
		onClick: () => openExternal(props.document, url),
	});
	return (
		<>
			<NativeSection title={loc('AppDetails_GameInfo', gdlText('game_information', 'Game information'))}>
				<NativeItem label={game?.name || props.shortcut.title} description={plainText(game?.short_description || game?.about_the_game || loc('Loading', 'Cargando…'))} />
				{developer ? <NativeItem label={gdlText('developer', 'Developer')} description={developer} /> : null}
				{publisher ? <NativeItem label={gdlText('publisher', 'Publisher')} description={publisher} /> : null}
				{franchise ? <NativeItem label={gdlText('franchise', 'Franchise')} description={franchise} /> : null}
				{game?.release_date?.date ? <NativeItem label={gdlText('release_date', 'Release date')} description={game.release_date.date} /> : null}
				{genres ? <NativeItem label={gdlText('genre_label', 'Genre')} description={genres} /> : null}
				<NativeItem label="Steam AppID" description={props.shortcut.steamAppId} />
			</NativeSection>
			<NativeSection title={loc('AppDetails_Features', 'Características')}>
				{categories.length > 0 ? categories.map(category => <NativeItem key={category} label={category} />) : (
					<NativeItem label={gdlText('full_controller', 'Full controller support')} />
				)}
			</NativeSection>
			<NativeSection title={loc('AppDetails_Links', 'Enlaces')}>
				{links.map(([label, url]) => (
					<NativeRow key={label}>
						<NativeFocusable {...linkActivation(url)}>
							<NativeButton {...linkClick(url)}>{label}</NativeButton>
						</NativeFocusable>
					</NativeRow>
				))}
			</NativeSection>
		</>
	);
}

function SemanticFallback({ tab, shortcut, data }: NativeDetailsProps): React.ReactElement {
	const count = tab === 'activity' ? data.news.length
		: tab === 'stuff' ? Number(data.achievements?.total || 0)
			: tab === 'community' ? communityItems(data).length
				: 1;
	return (
		<section aria-label={shortcut.title}>
			<h2>{shortcut.title}</h2>
			<p>{count > 0 ? `${count}` : loc('Loading', 'Cargando…')}</p>
		</section>
	);
}

export function NativeBigPictureDetails(props: NativeDetailsProps): React.ReactElement {
	let content: React.ReactElement;
	switch (props.tab) {
		case 'stuff': content = <StuffTab {...props} />; break;
		case 'community': content = <CommunityTab {...props} />; break;
		case 'info': content = <InfoTab {...props} />; break;
		default: content = <ActivityTab {...props} />; break;
	}
	return (
		<NativeDetailsBoundary fallback={<SemanticFallback {...props} />}>
			{content}
		</NativeDetailsBoundary>
	);
}

interface ReactRootHandle {
	render(node: ReactNode): void;
	unmount(): void;
}

const nativeRoots = new WeakMap<HTMLElement, ReactRootHandle>();

function findReactDom(doc: Document): any | null {
	const docWindow = doc.defaultView as any;
	for (const candidate of [docWindow?.ReactDOM, (window as any)?.ReactDOM]) {
		if (candidate && (typeof candidate.createRoot === 'function'
			|| (typeof candidate.render === 'function' && typeof candidate.unmountComponentAtNode === 'function'))) return candidate;
	}
	steamWebpackRuntime.captureRuntime(doc);
	for (const module of steamWebpackRuntime.getAllModules()) {
		const candidates = [module.exports, module.exports?.default, ...Object.values(module.exports || {})];
		for (const candidate of candidates) {
			if (candidate && (typeof (candidate as any).createRoot === 'function'
				|| (typeof (candidate as any).render === 'function' && typeof (candidate as any).unmountComponentAtNode === 'function'))) return candidate;
		}
	}
	return null;
}

export function mountNativeBigPictureDetails(container: HTMLElement, props: NativeDetailsProps): boolean {
	let root = nativeRoots.get(container);
	if (!root) {
		const reactDom = findReactDom(container.ownerDocument);
		if (!reactDom) return false;
		if (typeof reactDom.createRoot === 'function') {
			root = reactDom.createRoot(container) as ReactRootHandle;
		} else {
			root = {
				render: node => reactDom.render(node, container),
				unmount: () => reactDom.unmountComponentAtNode?.(container),
			};
		}
		nativeRoots.set(container, root);
	}
	root.render(<NativeBigPictureDetails {...props} />);
	return true;
}

export function unmountNativeBigPictureDetails(container: HTMLElement | null): void {
	if (!container) return;
	const root = nativeRoots.get(container);
	if (!root) return;
	try { root.unmount(); } catch {}
	nativeRoots.delete(container);
}
