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
			container-type: inline-size !important;
			height: 38px !important;
			padding: 0 8px !important;
			box-sizing: border-box !important;
			gap: 24px !important;
			overflow: visible !important;
			scrollbar-width: none !important;
		}
		#gdl-link-bar .gdl-link-bar-inner::-webkit-scrollbar {
			display: none !important;
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
		#gdl-link-bar .gdl-primary-more { display:none;position:relative;margin-left:auto;z-index:4; }
		#gdl-link-bar .gdl-primary-more summary { list-style:none;display:flex;align-items:center;justify-content:center;width:34px;height:26px;border-radius:3px;color:#9da4ab;font-size:18px;letter-spacing:1px;cursor:pointer;user-select:none; }
		#gdl-link-bar .gdl-primary-more summary::-webkit-details-marker { display:none; }
		#gdl-link-bar .gdl-primary-more[open] summary,#gdl-link-bar .gdl-primary-more summary:hover { color:#fff;background:rgba(255,255,255,.08); }
		#gdl-link-bar .gdl-primary-more-menu { position:absolute;right:0;top:31px;min-width:172px;padding:5px;background:#202a36;border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 22px rgba(0,0,0,.48); }
		#gdl-link-bar .gdl-primary-overflow-link { display:block;padding:7px 10px;color:#b8c3cf;text-decoration:none;font-size:13px;white-space:nowrap; }
		#gdl-link-bar .gdl-primary-overflow-link:hover { color:#fff;background:rgba(102,192,244,.16); }
		@container (max-width: 760px) {
			#gdl-link-bar .gdl-primary-link:nth-of-type(n+6) { display:none !important; }
			#gdl-link-bar .gdl-primary-more { display:block !important; }
		}
		@container (max-width: 560px) {
			#gdl-link-bar .gdl-primary-link:nth-of-type(n+4) { display:none !important; }
		}
	`);
}
