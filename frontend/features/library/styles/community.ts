import { injectLibraryStyle } from './inject';

export function ensureCommunityStyles(doc: Document): void {
	injectLibraryStyle(doc, 'gdl-community-styles', `
		#gdl-community-content { margin-top:34px;overflow:visible; }
		#gdl-community-content h2 { min-height:56px;margin:0 0 8px;padding:0 12px;box-sizing:border-box;display:flex;align-items:center;background:linear-gradient(180deg,#3a4555 0%,#282f39 52%,#20262f 100%);border-top:2px solid #4a93e2;border-radius:3px 3px 0 0;color:#c7e4f5; }
		#gdl-community-content h2 * { color:#c7e4f5; }
		.gdl-community-help { position:relative;display:inline-flex; }
		.gdl-community-help:hover .gdl-community-help-tooltip { display:block; }
		.gdl-community-help-tooltip { display:none;position:absolute;z-index:20;top:28px;inset-inline-start:0;width:300px;padding:10px;background:#74727e;color:#f1f1f1;font-size:14px;line-height:1.2;font-weight:400;text-transform:none;letter-spacing:0;box-shadow:0 2px 8px rgba(0,0,0,.45);pointer-events:none; }
		#gdl-community-inner { overflow:visible;height:auto;max-height:none; }
		.gdl-community-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px;align-items:stretch;overflow:visible; }
		.gdl-community-card { background:rgba(103,112,128,.14);overflow:hidden;cursor:pointer;display:flex;flex-direction:column;min-width:0;align-self:stretch;height:100%;box-sizing:border-box; }
		.gdl-community-card[hidden] { display:none !important; }
		.gdl-community-card-title,.gdl-community-card-description,.gdl-community-author { white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;word-break:normal; }
		.gdl-community-sentinel { height:2px;width:100%;grid-column:1/-1; }
		@media (max-width:1050px) { .gdl-community-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
		@media (max-width:720px) { .gdl-community-grid { grid-template-columns:1fr;gap:18px; } }
	`);
}
