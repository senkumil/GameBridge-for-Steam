import { injectLibraryStyle } from './styles/inject';
import { ensureInfoPanelStyles } from './styles/info';
import { ensurePrimaryLinksStyles } from './styles/primary-links';
import { ensureActivityStyles } from './styles/activity';
import { ensureCommunityStyles } from './styles/community';
import { ensureTradingCardStyles } from './styles/trading-cards';
import { ensureStatusComposerStyles } from './styles/status';
import { ensureHistoricalSidebarStyles } from './styles/historical-sidebar';

/**
 * Central library-style entry point. Individual visual surfaces own their own
 * fallback CSS so pixel-parity work can be changed and reviewed independently.
 */
export function ensureNativeGameInfoStyles(doc: Document): void {
	if (doc.getElementById('gdl-library-style-sentinel')) return;
	injectLibraryStyle(doc, 'gdl-library-style-sentinel', `
		[data-gdl-playbar-achievements="1"] .gdl-lp-fill{background:#2d73ff!important;}
		[class*="GameStatsSection"], [class*="gameStatsSection"] {
			min-width: 0 !important;
			flex-shrink: 1 !important;
			gap: 8px !important;
		}
		[class*="GameStat"], [class*="gameStat"] {
			min-width: 0 !important;
			overflow: visible !important;
		}
		[class*="PlayBarLabel"], [class*="playBarLabel"], [class*="GameStat"] [class*="PlayBarLabel"] {
			white-space: nowrap !important;
			overflow: visible !important;
			text-overflow: clip !important;
			font-size: 11px !important;
			letter-spacing: 0.3px !important;
		}
		[class*="PlayBarDetailLabel"], [class*="playBarDetailLabel"] {
			white-space: nowrap !important;
			overflow: visible !important;
		}
		[class*="LogoContainer"], [class*="logoContainer"] {
			max-width: 55% !important;
			max-height: 55% !important;
			transition: max-width 0.2s ease, max-height 0.2s ease !important;
		}
		[class*="LogoContainer"] img, [class*="logoContainer"] img {
			max-width: 100% !important;
			max-height: 100% !important;
			object-fit: contain !important;
		}

		/* Responsive hero banner and background resizing matching native Steam */
		[class*="TopCapsule"], [class*="topCapsule"],
		[class*="HeroAndLogo"], [class*="heroAndLogo"] {
			max-height: min(320px, 26vw, 36vh) !important;
			transition: max-height 0.2s ease, height 0.2s ease !important;
		}
		[class*="TopCapsule"] [class*="ImgContainer"],
		[class*="TopCapsule"] [class*="HeaderImage"],
		[class*="TopCapsule"] img[class*="ImgSrc"],
		[class*="HeroContainer"] img {
			object-fit: cover !important;
		}

		@media (max-width: 1200px) {
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(270px, 25vw, 32vh) !important;
			}
		}

		@media (max-width: 1000px) {
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(220px, 24vw, 28vh) !important;
			}
		}

		@media (max-width: 900px) {
			[class*="LogoContainer"], [class*="logoContainer"] {
				max-width: 48% !important;
				max-height: 48% !important;
			}
			[class*="PlayBarLabel"], [class*="playBarLabel"] {
				font-size: 10.5px !important;
			}
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(190px, 24vw, 26vh) !important;
			}
		}

		@media (max-width: 800px) {
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(170px, 24vw, 24vh) !important;
			}
		}

		@media (max-height: 750px) {
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(220px, 28vh) !important;
			}
		}

		@media (max-height: 600px) {
			[class*="TopCapsule"], [class*="topCapsule"],
			[class*="HeroAndLogo"], [class*="heroAndLogo"] {
				max-height: min(160px, 24vh) !important;
			}
		}
	`);
	ensureInfoPanelStyles(doc);
	ensurePrimaryLinksStyles(doc);
	ensureActivityStyles(doc);
	ensureCommunityStyles(doc);
	ensureTradingCardStyles(doc);
	ensureStatusComposerStyles(doc);
	ensureHistoricalSidebarStyles(doc);
	installHeroResponsiveResize(doc);
}

function installHeroResponsiveResize(doc: Document): void {
	if (doc.getElementById('gdl-hero-resize-sentinel')) return;
	const sentinel = doc.createElement('div');
	sentinel.id = 'gdl-hero-resize-sentinel';
	sentinel.style.display = 'none';
	(doc.body || doc.documentElement).appendChild(sentinel);

	const win = doc.defaultView || window;
	const updateHeroHeight = (): void => {
		for (const capsule of Array.from(doc.querySelectorAll<HTMLElement>('[class*="TopCapsule"], [class*="topCapsule"]'))) {
			const container = capsule.closest<HTMLElement>('[class*="AppDetailsMain"], [class*="MainPanel"], [class*="AppDetails"]')
				|| capsule.parentElement;
			const width = container ? container.clientWidth : win.innerWidth;
			if (width > 0) {
				const height = Math.max(160, Math.min(320, Math.round(width / 3.1)));
				capsule.style.setProperty('--header-height', `${height}px`);
			}
		}
	};

	win.addEventListener('resize', updateHeroHeight, { passive: true });
	const mainPanel = doc.querySelector('[class*="AppDetailsMain"], [class*="MainPanel"], [class*="AppDetails"]');
	if (mainPanel && typeof win.ResizeObserver === 'function') {
		const ro = new win.ResizeObserver(updateHeroHeight);
		ro.observe(mainPanel);
	}
	updateHeroHeight();
}
