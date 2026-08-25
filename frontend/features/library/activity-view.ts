import type { NewsItem } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { FEED_CLASSES, POST_CLASSES } from '../../steam/css';
import { gdlText, loc } from '../../steam/localization';
import { GDL_INJECTED } from './constants';
import type { NativeLibraryLayout } from './layout';
import { renderUnifiedActivityFeed, setupStatusPostBox } from './social';

export interface ActivityViewOptions {
	steamAppId: string;
	shortcutAppId: string | null;
	newsItems: NewsItem[];
	headerImage: string;
}

export function createActivityView(
	doc: Document,
	layout: NativeLibraryLayout,
	options: ActivityViewOptions,
): HTMLElement {
	const wrapper = doc.createElement('div');
	wrapper.id = GDL_INJECTED;
	wrapper.className = 'gdl-activity-container';
	wrapper.style.cssText = 'display:flex !important;flex-direction:column !important;justify-content:flex-start !important;align-items:stretch !important;min-height:0 !important;height:auto !important;flex:none !important;font-family:inherit;padding:0 12px 24px;overflow:visible;position:relative;';

	const postClasses = POST_CLASSES();
	const feedClasses = FEED_CLASSES();
	const feedHtml = renderUnifiedActivityFeed(options.steamAppId, options.shortcutAppId, options.newsItems, options.headerImage);
	wrapper.innerHTML = `
		<div style="font-family:'Motiva Sans',Arial,Helvetica,sans-serif;font-size:13.5px;font-weight:700;letter-spacing:1.5px;color:#8f98a0;margin:0 0 10px 0;text-transform:uppercase;">${escapeHtml(gdlText('activity', loc('AppDetails_SectionTitle_Activity', 'Activity')).toUpperCase())}</div>
		<div class="${feedClasses.AddToFeed || ''} ${feedClasses.PostTextEntry || ''} gdl-status-box-container ${postClasses.PostTextEntry || ''}" style="display:block !important;margin:0 0 16px 0 !important;min-height:0 !important;position:relative !important;z-index:50 !important;">
			<textarea id="gdl-status-text" class="${postClasses.PostTextEntryArea}" rows="1" placeholder="${escapeHtml(gdlText('post_placeholder', loc('AppActivity_StatusUpdate_Post', 'Say something about this game to your friends...')))}"></textarea>
			<div id="gdl-status-controls" class="${postClasses.Controls}">
				<div class="${postClasses.FormattingSpacer}"></div>
				<button type="button" class="${postClasses.EmoticonButton} gdl-emoticon-btn" tabindex="-1" title="${escapeHtml(gdlText('emoticons', 'Emoticons'))}" style="position:relative;">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" stroke-width="1.5"></circle><circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none"></circle><path d="M8 14c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4" stroke-width="1.5" stroke-linecap="round"></path></svg>
					<span style="position:absolute;top:4px;right:4px;width:6px;height:6px;border-radius:50%;background:#ffc83d;box-shadow:0 0 6px rgba(255,200,61,0.9);pointer-events:none;"></span>
				</button>
				<button type="button" id="gdl-status-post" class="${postClasses.PostButton}">
					<div class="${postClasses.Label}">${escapeHtml(gdlText('publish', loc('AppActivity_PostStatusUpdate', 'Post')))}</div>
				</button>
			</div>
		</div>
		<div id="gdl-activity-feed">${feedHtml}</div>`;

	const sourceHeading = layout.anchorRegion
		? Array.from(layout.anchorRegion.children).find(child => child.tagName === 'H2') as HTMLElement | undefined
		: undefined;
	const fallbackHeading = wrapper.querySelector('.gdl-native-activity-heading-fallback');
	if (sourceHeading && fallbackHeading) {
		const heading = sourceHeading.cloneNode(true) as HTMLElement;
		const headingText = heading.querySelector('div div') || heading.querySelector('div') || heading;
		headingText.textContent = gdlText('activity', loc('AppDetails_SectionTitle_Activity', 'Activity'));
		fallbackHeading.replaceWith(heading);
	}
	return wrapper;
}

export function wireActivityView(doc: Document, wrapper: HTMLElement, options: ActivityViewOptions): void {
	setupStatusPostBox(doc, wrapper, options.steamAppId, options.shortcutAppId, options.newsItems, options.headerImage);
}
