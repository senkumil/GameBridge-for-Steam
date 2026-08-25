import { injectLibraryStyle } from './inject';

export function ensurePrimaryLinksStyles(doc: Document): void {
	injectLibraryStyle(doc, 'gdl-primary-links-styles', `
		#gdl-link-bar {
			margin: 0 9px !important;
			width: calc(100% - 18px) !important;
			box-sizing: border-box !important;
		}
		#gdl-link-bar .gdl-link-bar-inner {
			display: flex !important;
			align-items: center !important;
			justify-content: flex-start !important;
			height: 38px !important;
			padding: 0 8px !important;
			box-sizing: border-box !important;
			gap: 32px !important;
		}
		#gdl-link-bar .gdl-primary-link {
			display: inline-flex !important;
			align-items: center !important;
			justify-content: center !important;
			color: #8f98a0 !important;
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
			font-size: 13px !important;
			font-weight: 400 !important;
			line-height: 26px !important;
			height: 26px !important;
			padding: 0 10px !important;
			text-decoration: none !important;
			white-space: nowrap !important;
			border-radius: 3px !important;
			transition: color 0.12s ease, background-color 0.12s ease !important;
			cursor: pointer !important;
			user-select: none !important;
		}
		#gdl-link-bar .gdl-primary-link:hover {
			color: #ffffff !important;
			background: rgba(255, 255, 255, 0.08) !important;
		}
		#gdl-link-bar .gdl-primary-link:active {
			color: #ffffff !important;
			background: rgba(255, 255, 255, 0.14) !important;
		}
	`);
}
