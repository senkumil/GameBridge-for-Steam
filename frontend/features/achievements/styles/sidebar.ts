import { injectAchievementStyle } from './inject';

export function ensureAchievementSidebarStyles(doc: Document): void {
	injectAchievementStyle(doc, 'gdl-achievement-sidebar-style', `
		#gdl-achievements-section { cursor:pointer; }
		@keyframes gdl-achievement-focus-pulse {
			0% { box-shadow:0 0 0 0 rgba(26,159,255,0),0 0 0 rgba(26,159,255,0); }
			25% { box-shadow:0 0 0 4px rgba(26,159,255,.48),0 0 28px rgba(26,159,255,.72); }
			100% { box-shadow:0 0 0 0 rgba(26,159,255,0),0 0 0 rgba(26,159,255,0); }
		}
		#gdl-achievements-section.gdl-achievement-focus { position:relative;z-index:2;animation:gdl-achievement-focus-pulse 1.35s ease-out; }

		/* Calibrated from the native 1920x1080 Steam Library sidebar: 388-390 px
		   wide region, 52 px achievement tiles and five visual slots per row. */
		#gdl-achievements-section,#gdl-achievements-section *, .gdl-la-summary {
			box-sizing:border-box;
		}
		.gdl-la-summary {
			width:100%;min-width:0;max-width:100%;
			background:var(--gdl-native-panel-bg,rgba(29,36,45,.64));border:1px solid var(--gdl-native-panel-border,rgba(255,255,255,.035));border-radius:0;padding:0;
			font-family:"Motiva Sans",Arial,Helvetica,sans-serif;color:#d6d7d8;cursor:pointer;overflow:hidden;
			box-shadow:none;transition:border-color .12s ease,background-color .12s ease;
		}
		/* Native achievement sidebars do not brighten the entire panel on hover. */
		.gdl-la-summary:hover { border-color:rgba(255,255,255,.055); }
		.gdl-la-header { background:rgba(68,78,91,.48);padding:11px 10px 10px;border-bottom:1px solid rgba(0,0,0,.24); }
		.gdl-la-body { padding:12px 10px 14px;background:rgba(18,24,31,.18);min-width:0;overflow:hidden; }
		.gdl-la-unlocked { font-size:13px;font-weight:500;line-height:18px;margin-bottom:7px;color:#d6d7d8; }
		.gdl-la-unlocked span.pct { color:#8f98a0;font-weight:400; }
		.gdl-la-progress-track { height:6px;background:#050708;border-radius:2px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.9); }
		.gdl-la-progress-fill { height:100%;background:#2d73ff;border-radius:2px;min-width:0;transition:width .3s ease; }
		.gdl-la-feature { display:flex;gap:10px;align-items:center;margin:0 0 9px;min-width:0; }
		.gdl-la-feature-copy { min-width:0;flex:1; }
		.gdl-la-feature-title { font-size:15px;font-weight:500;color:#e5e5e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25; }
		.gdl-la-feature-desc { font-size:13px;color:#9aa0a7;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px; }
		.gdl-la-icon-row { display:grid;gap:8px;align-items:center;width:100%;min-width:0;max-width:100%; }
		.gdl-la-icon { width:100%;height:auto;min-width:0;max-width:52px;aspect-ratio:1;object-fit:cover;background:#101820;box-shadow:0 1px 4px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.045);border-radius:0;box-sizing:border-box; }
		.gdl-la-feature .gdl-la-icon { flex:0 0 52px;border-color:rgba(255,255,255,.065);box-shadow:0 2px 7px rgba(0,0,0,.48); }
		.gdl-la-icon.is-locked { filter:grayscale(1) brightness(.36);opacity:.82;border-color:rgba(255,255,255,.025); }
		.gdl-la-icon-fallback { display:flex;align-items:center;justify-content:center;font-size:20px;background:#131b25;color:#78818d; }
		.gdl-la-icon-fallback.is-locked { color:#49515b; }
		.gdl-la-divider { height:1px;background:rgba(255,255,255,.075);margin:12px 0 9px; }
		.gdl-la-locked-label { font-size:13px;color:#8f98a0;margin-bottom:7px;font-weight:400; }
		.gdl-la-more { width:100%;height:auto;min-width:0;max-width:52px;aspect-ratio:1;display:flex;align-items:center;justify-content:center;background:#2b333d;color:#fff;font-size:17px;font-weight:700;border:1px solid rgba(255,255,255,.035);border-radius:0;box-sizing:border-box; }
		.gdl-la-view { margin-top:16px;padding-inline-end:2px;text-align:end;color:#8f98a0;font-size:13px;cursor:pointer;transition:color .12s ease; }
		.gdl-la-view:hover { color:#dcdedf; }
	`);
}
