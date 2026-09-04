import React, { Component, type ReactNode } from 'react';
import { DialogButton, Focusable, IconsModule, ModalRoot, ProgressBar, Spinner, showModal } from '@steambrew/client';
import { backendLog } from '../../api/backend';
import { steamGameMainPageUrl } from '../../core/steam-links';
import type { CommunityContentItem, FriendPlayInfo, LocalAchievementItem, NewsItem } from '../../domain/types';
import { gdlText, loc, steamIntlLocale } from '../../steam/localization';
import {
	resolveNativeAppDetailsClasses,
	resolveNativeSummaryCarousel,
	type NativeAppDetailsClasses,
	type NativeClassModule,
} from '../../steam/gamepad/components/AppDetailsNativeClasses';
import { steamWebpackRuntime } from '../../steam/modules/SteamWebpackRuntime';
import { eventTypeLabel, newsExcerpt } from '../library/news';
import { loadLocalActivityPosts } from '../library/social/feed';
import { getCachedPersona } from '../library/social/personas';
import { steamNativeGameInfo } from '../library/native-game-model';
import type { BigPictureDetailData, BigPictureTab, MappedShortcut } from './types';

type NativeComponent = React.ComponentType<any>;

const NativeFocusable = Focusable as NativeComponent;
const NativeButton = DialogButton as NativeComponent;
const NativeProgress = ProgressBar as NativeComponent;
const NativeSpinner = Spinner as NativeComponent;
const NativeIcons = IconsModule as Record<string, NativeComponent>;

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

class NativeDetailsBoundary extends Component<{ children: ReactNode; fallback: ReactNode; name?: string }, BoundaryState> {
	state: BoundaryState = { failed: false };

	static getDerivedStateFromError(): BoundaryState {
		return { failed: true };
	}

	componentDidCatch(error: Error): void {
		backendLog(`[NGL][Gamepad] Native Big Picture ${this.props.name || 'section'} failed: ${error.message}`);
	}

	render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

function nativeClasses(...values: Array<string | null | false | undefined>): string | undefined {
	const value = values.filter(Boolean).join(' ');
	return value || undefined;
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

function clickProps(action: () => void): { onClick: () => void } {
	return { onClick: action };
}

function showNativeImageModal(doc: Document, title: string, imageUrl: string, classes: NativeAppDetailsClasses): void {
	if (!imageUrl) return;
	let handle: { Close(): void } | undefined;
	const close = () => handle?.Close();
	try {
		handle = showModal(
			<ModalRoot onCancel={close} closeModal={close} bAllowFullSize bDisableBackgroundDismiss>
				<img className={classes.Media?.ScreenshotModal} width="100%" src={imageUrl} alt={title} />
				<NativeButton {...clickProps(close)}>{loc('Button_Close', 'Cerrar')}</NativeButton>
			</ModalRoot>,
			doc.body,
			{ strTitle: title, bNeverPopOut: true, bHideMainWindowForPopouts: false },
		);
	} catch {
		openExternal(doc, imageUrl);
	}
}

function Section({ classes, label, children, highlight, className, bodyClassName, headerClassName, rightColumn = false }: {
	classes: NativeAppDetailsClasses;
	label: ReactNode;
	children: ReactNode;
	highlight?: ReactNode;
	className?: string;
	bodyClassName?: string;
	headerClassName?: string;
	rightColumn?: boolean;
}): React.ReactElement {
	const labelId = React.useId();
	const section = classes.Section;
	const header = classes.SectionHeader;
	return (
		<NativeFocusable role="region" aria-labelledby={labelId} className={nativeClasses(section?.AppDetailsSection, className)}>
			<div className={nativeClasses(header?.SectionHeader, header?.PadLeft, headerClassName)}>
				<div id={labelId} className={header?.Label}><div className={header?.LabelText}>{label}</div></div>
			</div>
			<NativeFocusable
				className={nativeClasses(section?.AppDetailsSectionContainer, section?.AppDetailsSectionHasLabel, rightColumn && section?.RightColumnSection)}
				scrollIntoViewWhenChildFocused
			>
				{highlight ? <div className={section?.Highlight}>{highlight}</div> : null}
				<div className={nativeClasses(section?.Body, bodyClassName)}>{children}</div>
			</NativeFocusable>
		</NativeFocusable>
	);
}

function NativeStrip({ name, children, className }: { name: string; children: ReactNode; className?: string }): React.ReactElement {
	const NativeCarousel = resolveNativeSummaryCarousel();
	const fallback = <NativeFocusable flow-children="row" className={className}>{children}</NativeFocusable>;
	if (!NativeCarousel) return fallback;
	return (
		<NativeDetailsBoundary name={`${name} carousel`} fallback={fallback}>
			<NativeCarousel aria-label={name} className={className} leftMargin={32} edgeMask="none" fnUpdateArrows={() => {}}>
				{children}
				<div data-carousel="ignore" />
			</NativeCarousel>
		</NativeDetailsBoundary>
	);
}

function LoadingContent({ hydrating, empty, className }: { hydrating: boolean; empty: string; className?: string }): React.ReactElement {
	return hydrating && NativeSpinner ? <NativeSpinner /> : <div className={className}>{empty}</div>;
}

function newsDate(item: NewsItem): string {
	return Number(item.date || 0) > 0 ? new Date(Number(item.date) * 1000).toLocaleDateString(steamIntlLocale()) : '';
}

function newsDayKey(item: NewsItem): string {
	const timestamp = Number(item.date || 0);
	if (timestamp <= 0) return 'unknown';
	const date = new Date(timestamp * 1000);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function newsDayLabel(item: NewsItem): string {
	const timestamp = Number(item.date || 0);
	if (timestamp <= 0) return loc('AppDetails_Activity_Recent', 'Reciente');
	try {
		const date = new Date(timestamp * 1000);
		return new Intl.DateTimeFormat(steamIntlLocale(), {
			day: 'numeric',
			month: 'long',
			...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' as const }),
		}).format(date);
	} catch {
		return newsDate(item);
	}
}

function ActivityEventCard({ item, classes, document }: { item: NewsItem; classes: NativeAppDetailsClasses; document: Document }): React.ReactElement {
	const event = classes.ActivityEvent;
	const activate = item.url ? () => openExternal(document, item.url) : undefined;
	const type = item.event_type ? eventTypeLabel(Number(item.event_type)) : (item.feedlabel || gdlText('feed_news', 'News'));
	const description = newsExcerpt(item.contents || '', 260);
	if (item.image) {
		return (
			<div className={nativeClasses(event?.Event, event?.PartnerEvent, event?.PartnerEventMediumImage)}>
				<NativeFocusable focusable onActivate={activate} className={event?.PartnerEventMediumImage_Container}>
					<div className={event?.PartnerEventMediumImage_Contents}>
						<div className={event?.MediumImageContainer}><img className={event?.PartnerEventMediumImage_Image} src={item.image} alt="" /></div>
						<div className={event?.PartnerEventMediumImage_TextColumn}>
							<div className={event?.PartnerEventType}>{type}</div>
							<div className={event?.PartnerEventMediumImage_Title}>{item.title}</div>
							{description ? <div className={event?.PartnerEventMediumImage_Summary}>{description}</div> : null}
						</div>
					</div>
				</NativeFocusable>
			</div>
		);
	}
	return (
		<div className={nativeClasses(event?.Event, event?.PartnerEvent, event?.PartnerEventTextOnly)}>
			<NativeFocusable focusable onActivate={activate} className={event?.PartnerEventTextOnly_Container}>
				<div className={event?.PartnerEventTextOnly_Icon}>{NativeIcons.Patch ? <NativeIcons.Patch /> : null}</div>
				<div className={event?.PartnerEventTextOnly_TextColumn}>
					<div className={event?.PartnerEventType}>{type}</div>
					<div className={event?.PartnerEventTextOnly_Title}>{item.title}</div>
					{description ? <div className={event?.PartnerEventTextOnly_LimitedSummary}><span className={event?.PartnerEventTextOnly_Summary}>{description}</span></div> : null}
				</div>
			</NativeFocusable>
		</div>
	);
}

function friendLabel(friend: FriendPlayInfo): string {
	return getCachedPersona(friend.steamid)?.name || friend.steamid;
}

function FriendsSection(props: NativeDetailsProps & { classes: NativeAppDetailsClasses }): React.ReactElement | null {
	const played = [...(props.data.friends?.recentlyPlayed || []), ...(props.data.friends?.previouslyPlayed || [])];
	const wishlisted = props.data.friends?.wishlisted || [];
	if (played.length === 0 && wishlisted.length === 0) return null;
	const native = props.classes.Friends;
	const renderFriends = (friends: FriendPlayInfo[], name: string) => (
		<div className={native?.Subsection}>
			<div className={native?.SubsectionHeader}>{name}</div>
			<div className={native?.FriendsContainer}><NativeStrip name={`NativeGameLink ${name}`}>
				{friends.slice(0, 12).map(friend => {
					const persona = getCachedPersona(friend.steamid);
					return <NativeFocusable key={friend.steamid} focusable className={native?.GamepadFriendSectionItem}><div className={native?.AvatarAndLabel}>{persona?.avatar ? <img src={persona.avatar} alt="" /> : null}<div className={native?.LabelHolder}>{friendLabel(friend)}</div></div></NativeFocusable>;
				})}
			</NativeStrip></div>
		</div>
	);
	return (
		<Section classes={props.classes} label={loc('AppDetails_Friends_Title', 'Amigos')} className={native?.FriendsSection}>
			{played.length > 0 ? renderFriends(played, loc('AppDetails_Friends_PlayedPreviously_Header', 'Jugado(s) anteriormente')) : null}
			{wishlisted.length > 0 ? renderFriends(wishlisted, loc('AppDetails_Friends_OnWishlist', 'En su lista de deseados')) : null}
		</Section>
	);
}

function ActivityTab(props: NativeDetailsProps): React.ReactElement {
	const classes = resolveNativeAppDetailsClasses();
	const activity = classes.Activity;
	const posts = loadLocalActivityPosts(props.shortcut.steamAppId, String(props.shortcut.id));
	const news = [...props.data.news].filter(item => item?.title).sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
	const [limit, setLimit] = React.useState(12);
	const visibleNews = news.slice(0, limit);
	const dayGroups = visibleNews.reduce<Array<{ key: string; label: string; items: NewsItem[] }>>((groups, item) => {
		const key = newsDayKey(item);
		const current = groups[groups.length - 1];
		if (current?.key === key) current.items.push(item);
		else groups.push({ key, label: newsDayLabel(item), items: [item] });
		return groups;
	}, []);
	const event = classes.ActivityEvent;
	return (
		<>
			<FriendsSection {...props} classes={classes} />
			<Section classes={classes} label={loc('AppDetails_SectionTitle_Activity', 'Actividad')} className={activity?.ActivityFeedContainer} bodyClassName={activity?.InnerContainer}>
				{posts.slice(0, 4).map(post => (
					<div key={post.id} className={classes.ActivityEvent?.Event}>
						<NativeFocusable className={classes.ActivityEvent?.UserStatus}>
							<div className={classes.ActivityEvent?.EventHeadline}>{post.user_name || gdlText('user_status', 'Status post')}</div>
							<div className={classes.ActivityEvent?.StatusText}>{post.text}</div>
						</NativeFocusable>
					</div>
				))}
				{dayGroups.map(group => (
					<div key={group.key} className={event?.AppActivityDay} role="region">
						<div className={event?.AppActivityDate}>{group.label}<div className={event?.Rule} /></div>
						<div className={event?.AppDayContents}>{group.items.map(item => <ActivityEventCard key={item.gid || item.url || item.title} item={item} classes={classes} document={props.document} />)}</div>
					</div>
				))}
				{limit < news.length ? <div className={activity?.FetchMoreContainer}><NativeButton {...clickProps(() => setLimit(value => value + 12))}>{loc('AppDetails_Activity_LoadMore', 'Cargar más actividad')}</NativeButton></div> : null}
				{posts.length === 0 && news.length === 0 ? <LoadingContent hydrating={props.hydrating} className={activity?.NoActivity} empty={gdlText('no_recent_activity', 'No recent activity.')} /> : null}
			</Section>
		</>
	);
}

function AchievementCarousel({ items, classes, name }: { items: LocalAchievementItem[]; classes: NativeAppDetailsClasses; name: string }): React.ReactElement | null {
	const [focused, setFocused] = React.useState(0);
	const achievement = classes.Achievement;
	if (items.length === 0) return null;
	return (
		<NativeStrip name={name} className={achievement?.SummaryCarouselContainer}>
			{items.slice(0, 32).map((item, index) => (
				<NativeFocusable key={item.name} focusable onFocus={() => setFocused(index)} className={nativeClasses(achievement?.AchievementCarouselItem, focused === index && achievement?.Detailed)}>
					<img className={nativeClasses(achievement?.CarouselIcon, index === focused && achievement?.Prioritized, item.earned ? achievement?.Achieved : achievement?.NotAchieved)} src={item.earned ? item.icon : (item.icon_gray || item.icon)} alt={focused === index ? '' : (item.display_name || item.name)} />
					{focused === index ? (
						<div className={achievement?.AchivementCarouselItemDetails}>
							<div className={achievement?.Name}>{item.display_name || item.name}</div>
							<div className={achievement?.Description}>{item.description}</div>
							{Number.isFinite(item.global_percent) ? <div className={achievement?.Achieved}>{item.global_percent.toFixed(1)}%</div> : null}
						</div>
					) : null}
				</NativeFocusable>
			))}
		</NativeStrip>
	);
}

function AchievementsSection(props: NativeDetailsProps & { classes: NativeAppDetailsClasses }): React.ReactElement {
	const achievements = props.data.achievements;
	const total = Math.max(0, Number(achievements?.total || props.data.game?.achievements?.total || 0));
	const unlocked = Math.max(0, Math.min(total, Number(achievements?.unlocked || 0)));
	const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;
	const native = props.classes.Achievement;
	const items = achievements?.achievements || [];
	const earned = items.filter(item => item.earned);
	const locked = items.filter(item => !item.earned);
	const orderedItems = [...earned, ...locked];
	const highlight = total > 0 ? (
		<div className={nativeClasses(native?.HighlightDiv, percent === 100 && native?.AllAchieved)}>
			{percent === 100 && NativeIcons.Achievement ? <NativeIcons.Achievement className={native?.Ribbon} /> : null}
			<div className={native?.UnlockedLabel}>
				<span>{gdlText('achievements_unlocked', '{unlocked} of {total} achievements unlocked', { unlocked, total })}</span>
				<span className={native?.UnlockedLabelPercent}> ({percent}%)</span>
			</div>
			<div className={native?.AchievementProgressContainer}><NativeProgress nProgress={percent / 100} /></div>
		</div>
	) : null;
	return (
		<Section classes={props.classes} label={loc('AppDetails_SectionTitle_Achievements', gdlText('achievements_label', 'Achievements'))} highlight={highlight} className={native?.BasicAppDetailsAchievementsSection} bodyClassName={native?.BasicAppDetailsAchievementsSectionBody} rightColumn>
			<AchievementCarousel items={orderedItems} classes={props.classes} name="NativeGameLink Achievements" />
			{locked.length > 0 ? <div className={native?.UnachievedSection}><div className={native?.LockedAchievementsLabel}>{loc('AppDetails_Achievements_Locked', 'Logros bloqueados')}</div><NativeFocusable flow-children="row">{locked.slice(0, 12).map(item => <img key={item.name} className={native?.CarouselIcon} src={item.icon_gray || item.icon} alt={item.display_name || item.name} />)}</NativeFocusable></div> : null}
			{items.length === 0 ? <LoadingContent hydrating={props.hydrating} empty={gdlText('no_achievements', 'No achievements found.')} /> : null}
		</Section>
	);
}

function TradingCardsSection(props: NativeDetailsProps & { classes: NativeAppDetailsClasses }): React.ReactElement {
	const cards = props.data.cards?.cards || [];
	const badge = props.data.cards?.badges?.[0];
	const native = props.classes.TradingCard;
	return (
		<Section classes={props.classes} label={loc('AppDetails_SectionTitle_TradingCards', gdlText('trading_cards', 'Trading cards'))} bodyClassName={native?.Container} rightColumn>
			{badge ? <div className={native?.BadgeSection}><div className={nativeClasses(native?.Badge, native?.EmptyCircle)} /><div className={native?.BadgeInfo}><div className={native?.BadgeName}>{badge.title}</div><div className={native?.BadgeLevel}>{gdlText('experience_points', '100 EXP')}</div></div></div> : null}
			{cards.length > 0 ? (
				<div className={native?.CardsSection}><div className={native?.CardsLeft}>{gdlText('cards_remaining', '{count} cards remaining', { count: cards.length })}</div><NativeStrip name="NativeGameLink Trading Cards">
					{cards.slice(0, 18).map((card, index) => (
						<NativeFocusable key={`${card.title}-${index}`} focusable onActivate={() => showNativeImageModal(props.document, card.title, card.artwork || card.image, props.classes)} className={nativeClasses(native?.TradingCardCarouselItem, native?.Unowned, native?.Clickable)}>
							<div className={native?.CardWrapper}><div className={native?.Card}><div className={native?.CardContainer}><img className={nativeClasses(native?.CardImage, native?.Loaded)} src={card.image} alt={card.title} /></div><div className={native?.Title}>{card.title}</div></div></div>
						</NativeFocusable>
					))}
				</NativeStrip></div>
			) : <LoadingContent hydrating={props.hydrating} empty={loc('AppDetails_NoTradingCards', 'Este juego no tiene cromos disponibles.')} />}
		</Section>
	);
}

function communityItems(data: BigPictureDetailData): CommunityContentItem[] {
	if (data.community.length > 0) return data.community;
	return (data.game?.screenshots || []).map((shot, index) => ({ type: 'screenshot', image: shot.path_full || shot.path_thumbnail, title: `${loc('AppDetails_Community_Screenshot', 'Captura')} ${index + 1}` }));
}

function CommunityCard({ item, index, classes, document }: { item: CommunityContentItem; index: number; classes: NativeAppDetailsClasses; document: Document }): React.ReactElement {
	const native = classes.Community;
	const title = item.title || item.label || loc('AppDetails_Community_Screenshot', 'Contenido de la comunidad');
	const author = item.author_name ? <div className={native?.AuthorSection}>{item.author_avatar ? <img className={native?.Avatar} src={item.author_avatar} alt="" /> : null}<div className={native?.AuthorName}>{item.author_name}</div></div> : null;
	if (item.type === 'guide') {
		return (
			<NativeFocusable focusable role="gridcell" data-size="Medium" data-id={`guide-${index}`} onActivate={item.link ? () => openExternal(document, item.link!) : undefined} className={nativeClasses(native?.CommunityItem, native?.Medium)}>
				<div className={native?.ChildItem}>
					<div className={native?.Guide}>
						<div className={native?.Header}>{loc('AppDetails_Community_Guide', 'Guía de la comunidad')}</div>
						<div className={native?.TopSection}><div className={native?.TopSectionInner}>
							{item.image ? <div className={native?.PreviewContainer}><img className={native?.Preview} src={item.image} alt="" /></div> : null}
							<div className={native?.GuideTitle}>{title}</div>
						</div></div>
						{item.description ? <div className={native?.Body}><div className={native?.Description}>{plainText(item.description, 180)}</div></div> : null}
					</div>
				</div>
				{author}
			</NativeFocusable>
		);
	}
	return (
		<NativeFocusable focusable role="gridcell" data-size="Medium" data-id={`${item.type}-${index}`} onActivate={item.link ? () => openExternal(document, item.link!) : undefined} className={nativeClasses(native?.CommunityItem, native?.Medium)}>
			<div className={native?.ChildItem}>
				<div className={native?.ArtItem}>
					<div className={native?.PreviewContainer}>{item.image ? <img className={native?.Preview} src={item.image} alt={title} /> : null}</div>
					<div className={native?.BottomSection}><div className={native?.DescriptionRow}>{title}</div></div>
				</div>
			</div>
			{author}
		</NativeFocusable>
	);
}

function rowsOf<T>(values: T[], size: number): T[][] {
	const rows: T[][] = [];
	for (let index = 0; index < values.length; index += size) rows.push(values.slice(index, index + size));
	return rows;
}

function CommunityGrid({ items, classes, document }: { items: CommunityContentItem[]; classes: NativeAppDetailsClasses; document: Document }): React.ReactElement {
	const native = classes.Community;
	return (
		<NativeFocusable role="grid" aria-readonly flow-children="geometric" className={native?.InnerContainer}>
			{rowsOf(items.slice(0, 24), 3).map((row, rowIndex) => (
				<div key={rowIndex} role="row" className={nativeClasses(native?.AppOverviewRow, row.length === 3 ? native?.AnyThree : row.length === 2 ? native?.AnyTwo : native?.Singles)}>
					{row.map((item, index) => <CommunityCard key={`${item.type}-${item.title}-${index}`} item={item} index={rowIndex * 3 + index} classes={classes} document={document} />)}
				</div>
			))}
		</NativeFocusable>
	);
}

function MediaSection(props: NativeDetailsProps & { classes: NativeAppDetailsClasses }): React.ReactElement {
	const native = props.classes.Media;
	return (
		<Section classes={props.classes} label={loc('AppDetails_SectionTitle_Media', 'Archivos multimedia')} className={native?.ScreenshotsSection} rightColumn>
			<div className={native?.NoRecent}>{loc('AppDetails_ScreenshotHint_Gamepad', 'Puedes hacer una captura de pantalla durante el juego desde la superposición de Steam.')}</div>
			<NativeButton>{loc('AppDetails_ManageScreenshots', 'Ir a mi biblioteca multimedia')}</NativeButton>
		</Section>
	);
}

function ReviewSection({ classes }: { classes: NativeAppDetailsClasses }): React.ReactElement {
	const native = classes.Review;
	return (
		<Section classes={classes} label={loc('AppDetails_SectionTitle_Review', 'Mi reseña')} bodyClassName={native?.InnerContainerLower2} rightColumn>
			<div className={native?.ReviewPresentGroup}>
				<div className={native?.ReviewDescription}>{loc('AppDetails_Review_None', 'Todavía no has escrito una reseña de este juego.')}</div>
				<div className={native?.ButtonsGroup}><NativeButton>{loc('AppDetails_Review_ViewAll', 'Ver todas mis reseñas')}</NativeButton></div>
			</div>
		</Section>
	);
}

function NotesSection({ classes }: { classes: NativeAppDetailsClasses }): React.ReactElement {
	const native = classes.Notes;
	return (
		<Section classes={classes} label={loc('AppDetails_SectionTitle_GameNotes', 'Notas')} rightColumn>
			<div className={native?.NoteLink}><span className={native?.Untitled}>{loc('AppDetails_Notes_Empty', 'No hay notas para este juego.')}</span></div>
			<NativeButton className={native?.ViewAllLink}>{loc('AppDetails_CreateNewNote', 'Nueva nota')}</NativeButton>
		</Section>
	);
}

function StuffTab(props: NativeDetailsProps): React.ReactElement {
	const classes = resolveNativeAppDetailsClasses();
	return (
		<>
			<AchievementsSection {...props} classes={classes} />
			<TradingCardsSection {...props} classes={classes} />
			<MediaSection {...props} classes={classes} />
			<ReviewSection classes={classes} />
			<NotesSection classes={classes} />
		</>
	);
}

function CommunityTab(props: NativeDetailsProps): React.ReactElement {
	const classes = resolveNativeAppDetailsClasses();
	const items = communityItems(props.data).filter(item => item.title || item.image);
	return (
		<Section classes={classes} label={loc('AppDetails_SectionTitle_Community', gdlText('community_content', 'Community content'))} className={classes.Community?.CommunityContentContainer} headerClassName={classes.Community?.HeaderStyles}>
			{items.length > 0 ? <CommunityGrid items={items} classes={classes} document={props.document} /> : <LoadingContent hydrating={props.hydrating} className={classes.Community?.NoContent} empty={loc('AppDetails_Community_NoContent', 'No hay contenido de la comunidad disponible.')} />}
		</Section>
	);
}

function AssociationRow({ native, label, values }: { native: NativeClassModule | null; label: string; values: string[] }): React.ReactElement | null {
	if (values.length === 0) return null;
	return <div className={native?.AssociationList}><div className={native?.Label}>{label}</div><div className={native?.Association}>{values.map(value => <span className={native?.Name} key={value}>{value}</span>)}</div></div>;
}

function NativeFeature({ kind, label, classes }: { kind: string; label: string; classes: NativeAppDetailsClasses }): React.ReactElement {
	const native = classes.Feature;
	const iconNames: Record<string, string[]> = {
		'single-player': ['SinglePlayer', 'User'],
		multiplayer: ['MultiPlayer', 'Friends'],
		coop: ['Coop', 'MultiPlayer'],
		achievements: ['SteamAchievements', 'Achievement'],
		cloud: ['CloudSync', 'Cloud'],
		'controller-full': ['GenericStoreGamepad', 'Controller'],
		'controller-partial': ['GenericStoreGamepad', 'Controller'],
		workshop: ['Workshop'],
		'remote-play': ['RemotePlayTogether'],
		'family-sharing': ['FamilySharing'],
	};
	const Icon = (iconNames[kind] || ['Information']).map(name => NativeIcons[name]).find(Boolean);
	return <div className={native?.Container}>{Icon ? <Icon className={native?.Icon} /> : null}<div className={native?.Label}>{label}</div></div>;
}

function InfoTab(props: NativeDetailsProps): React.ReactElement {
	const classes = resolveNativeAppDetailsClasses();
	const game = props.data.game;
	const native = classes.GameInfo;
	const frame = classes.GameInfoFrame;
	const appid = props.shortcut.steamAppId;
	const model = game ? steamNativeGameInfo(game, appid) : null;
	const linkClasses = classes.Links;
	const cover = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`;
	const links: Array<[string, string]> = [
		[loc('AppDetails_Links_Store', gdlText('store_page', 'Store page')), steamGameMainPageUrl(appid, game?.is_delisted === true)],
		[loc('AppDetails_Links_Community', gdlText('community_hub', 'Community hub')), `https://steamcommunity.com/app/${appid}`],
		[loc('AppDetails_Link_Discussions', gdlText('discussions', 'Discussions')), `https://steamcommunity.com/app/${appid}/discussions/`],
		[loc('AppDetails_Link_Guides', gdlText('guides', 'Guides')), `https://steamcommunity.com/app/${appid}/guides/`],
		[loc('AppDetails_Link_Support', gdlText('support', 'Support')), `https://help.steampowered.com/en/wizard/HelpWithGame/?appid=${appid}`],
	];
	return (
		<>
			<div className={nativeClasses(frame?.AppGameInfoContainer, frame?.AppDetailsExpanded, frame?.SuppressTransition, frame?.Glassy)}>
				<div className={native?.Container}>
					<div className={native?.InnerContainer}>
						<div className={native?.Portrait}><img className={native?.BoxArt} width="100%" src={cover} alt={game?.name || props.shortcut.title} /></div>
						<div className={nativeClasses(native?.Description, native?.SectionContainer)}><div className={native?.GameDescription}>{plainText(model?.description || loc('Loading', 'Cargando…'), 720)}</div></div>
						<div className={nativeClasses(native?.Stats, native?.SectionContainer)}>
							<AssociationRow native={native} label={gdlText('developer', 'Developer')} values={model?.developer ? [model.developer] : []} />
							<AssociationRow native={native} label={gdlText('publisher', 'Publisher')} values={model?.publisher ? [model.publisher] : []} />
							<AssociationRow native={native} label={gdlText('franchise', 'Franchise')} values={model?.franchise ? [model.franchise] : []} />
							{model?.release ? <div className={native?.Release}><div className={native?.Label}>{gdlText('release_date', 'Release date')}</div><div className={native?.Date}>{model.release}</div></div> : null}
							<div className={native?.Release}><div className={native?.Label}>Steam AppID</div><div className={native?.Date}>{appid}</div></div>
						</div>
						<div className={nativeClasses(native?.FeaturesList, native?.SectionContainer)}>
							{(model?.features || []).map(feature => <NativeFeature key={feature.key} kind={feature.kind} label={feature.label} classes={classes} />)}
						</div>
					</div>
				</div>
				<div className={frame?.GameInfoShadow} />
			</div>
			<Section classes={classes} label={loc('AppDetails_Links', 'Enlaces')} className={linkClasses?.LinksSection} bodyClassName={linkClasses?.LinksSectionBody}>
				<NativeStrip name="NativeGameLink Links" className={linkClasses?.Links}>{links.map(([label, url]) => (
					<div key={label} className={linkClasses?.LinkInner}><NativeFocusable focusable role="link" className={linkClasses?.Anchor} onActivate={() => openExternal(props.document, url)}><div className={linkClasses?.Link}><span className={linkClasses?.Text}>{label}</span></div></NativeFocusable></div>
				))}</NativeStrip>
			</Section>
		</>
	);
}

function SafeTabFallback(props: NativeDetailsProps): React.ReactElement {
	const classes = resolveNativeAppDetailsClasses();
	return <Section classes={classes} label={props.shortcut.title}><LoadingContent hydrating={props.hydrating} empty={loc('Loading', 'Cargando…')} /></Section>;
}

export function NativeBigPictureDetails(props: NativeDetailsProps): React.ReactElement {
	let content: React.ReactElement;
	switch (props.tab) {
		case 'stuff': content = <StuffTab {...props} />; break;
		case 'community': content = <CommunityTab {...props} />; break;
		case 'info': content = <InfoTab {...props} />; break;
		default: content = <ActivityTab {...props} />; break;
	}
	return <NativeDetailsBoundary key={`${props.tab}-${props.shortcut.id}-${props.shortcut.steamAppId}`} name={props.tab} fallback={<SafeTabFallback {...props} />}>{content}</NativeDetailsBoundary>;
}

interface ReactRootHandle {
	render(node: ReactNode): void;
	unmount(): void;
}

const nativeRoots = new WeakMap<HTMLElement, ReactRootHandle>();

function findReactDom(doc: Document): any | null {
	const docWindow = doc.defaultView as any;
	for (const candidate of [docWindow?.SP_REACTDOM, (window as any)?.SP_REACTDOM, docWindow?.ReactDOM, (window as any)?.ReactDOM]) {
		if (candidate && (typeof candidate.createRoot === 'function' || (typeof candidate.render === 'function' && typeof candidate.unmountComponentAtNode === 'function'))) return candidate;
	}
	steamWebpackRuntime.captureRuntime(doc);
	for (const module of steamWebpackRuntime.getAllModules()) {
		const candidates = [module.exports, module.exports?.default, ...Object.values(module.exports || {})];
		for (const candidate of candidates) {
			if (candidate && (typeof (candidate as any).createRoot === 'function' || (typeof (candidate as any).render === 'function' && typeof (candidate as any).unmountComponentAtNode === 'function'))) return candidate;
		}
	}
	return null;
}

export function mountNativeBigPictureDetails(container: HTMLElement, props: NativeDetailsProps): boolean {
	let root = nativeRoots.get(container);
	if (!root) {
		const reactDom = findReactDom(container.ownerDocument);
		if (!reactDom) return false;
		if (typeof reactDom.createRoot === 'function') root = reactDom.createRoot(container) as ReactRootHandle;
		else root = { render: node => reactDom.render(node, container), unmount: () => reactDom.unmountComponentAtNode?.(container) };
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
