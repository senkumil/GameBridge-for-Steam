import { injectLibraryStyle } from './inject';

export function ensureTradingCardStyles(doc: Document): void {
	injectLibraryStyle(doc, 'gdl-trading-card-styles', `
		#gdl-trading-cards-section,#gdl-trading-cards-section > *,#gdl-trading-cards-section [role="region"],#gdl-trading-cards-content,#gdl-trading-cards-content > * { max-width:100%;box-sizing:border-box;overflow:visible !important; }
		.gdl-trading-cards-body { container-type:inline-size;min-width:0;max-width:100%;overflow:visible !important;box-sizing:border-box; }
		.gdl-native-sidebar-panel { min-width:0;max-width:100%;box-sizing:border-box; }
		.gdl-trading-card-grid { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;align-items:start;width:100%;min-width:0;max-width:100%;overflow:visible;perspective:900px;margin-top:2px; }
		.gdl-trading-card { --gdl-card-angle:115deg;position:relative;min-width:0;width:100%;aspect-ratio:224/261;z-index:1;overflow:visible;cursor:pointer; }
		.gdl-trading-card-surface { position:absolute;inset:0;width:100%;height:100%;z-index:1;transform:perspective(620px) rotateX(0) rotateY(0);transform-style:preserve-3d;transform-origin:center center;transition:left .32s cubic-bezier(0.16,1,0.3,1),top .32s cubic-bezier(0.16,1,0.3,1),width .32s cubic-bezier(0.16,1,0.3,1),height .32s cubic-bezier(0.16,1,0.3,1),transform .09s ease-out,filter .24s ease;cursor:pointer;border-radius:2px;overflow:hidden;box-shadow:inset 0 1px 0 rgba(255,255,255,0.22),inset 0 0 0 1px rgba(255,255,255,0.06);will-change:transform,left,top,width,height; }
		.gdl-trading-card-surface::after { content:"";position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;background:linear-gradient(var(--gdl-card-angle,125deg),rgba(255,255,255,var(--gdl-sheen-alpha,0.12)) 0%,rgba(255,255,255,calc(var(--gdl-sheen-alpha,0.12) * 0.35)) 40%,rgba(0,0,0,0.18) 100%);transition:opacity .22s ease; }
		.gdl-trading-card.gdl-card-tilt-active { z-index:100; }
		.gdl-trading-card.gdl-card-tilt-active .gdl-trading-card-surface { z-index:100; pointer-events:auto; filter:drop-shadow(0 18px 32px rgba(0,0,0,.85)) drop-shadow(0 4px 12px rgba(0,0,0,.45)); }
		.gdl-trading-card.gdl-card-tilt-active .gdl-trading-card-surface::after { opacity:1; }
		.gdl-trading-card img { display:block;width:100%;height:100%;min-width:0;object-fit:contain;image-rendering:auto;box-sizing:border-box;border:0;backface-visibility:hidden;filter:brightness(var(--gdl-sheen-brightness,1)) contrast(1.03);transition:filter .08s ease-out; }
		.gdl-trading-cards-badge-header { display:flex;align-items:center;gap:12px;padding:12px 14px;background:#2d3540;border-bottom:1px solid rgba(0,0,0,0.35);color:#c7ccd1; }
		.gdl-trading-badge { width:60px;height:60px;flex:0 0 60px;padding:0;box-sizing:border-box;background:transparent;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55)); }
		.gdl-trading-badge img { display:block;width:100%;height:100%;object-fit:contain;border-radius:0;image-rendering:auto; }
		.gdl-trading-cards-help-btn { width:17px;height:17px;border-radius:50%;background:rgba(255,255,255,0.16);border:0;color:#dcdedf;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:"Motiva Sans",Arial,sans-serif;cursor:pointer;margin-inline-start:8px;vertical-align:middle;padding:0;line-height:1;transition:background .15s,color .15s; }
		.gdl-trading-cards-help-btn:hover { background:rgba(255,255,255,0.30);color:#fff; }
		.gdl-trading-cards-help-popup { background:#3d4450;border:1px solid rgba(255,255,255,0.08);box-shadow:0 8px 24px rgba(0,0,0,0.65);border-radius:2px;padding:14px 16px;color:#c6d4df;font-family:"Motiva Sans",Arial,sans-serif;font-size:12.5px;line-height:1.45;font-weight:400;text-transform:none;letter-spacing:0;pointer-events:none;box-sizing:border-box; }
		#gdl-trading-card-preview { position:fixed;inset:0;z-index:2147483605;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;background:rgba(5,8,12,.86);opacity:0;transition:opacity .14s ease; }
		#gdl-trading-card-preview.is-visible { opacity:1; }
		.gdl-trading-card-preview-panel { position:relative;display:flex;flex-direction:column;align-items:center;width:min(1500px,calc(100vw - 30px));max-height:calc(100vh - 24px);padding:16px 16px 12px;box-sizing:border-box;background:#2b313a;border:1px solid #506070;box-shadow:0 18px 70px rgba(0,0,0,.82); }
		.gdl-trading-card-preview-image { display:block;width:100%;height:auto;max-height:calc(100vh - 116px);object-fit:contain;image-rendering:auto;background:#080b0f; }
		.gdl-trading-card-preview-x { position:absolute;z-index:2;top:2px;right:5px;padding:0;border:0;background:transparent;color:#82909d;font-size:27px;line-height:1;cursor:pointer;text-shadow:0 1px 2px #000; }
		.gdl-trading-card-preview-x:hover { color:#dcdedf; }
		.gdl-trading-card-preview-close { width:min(625px,52vw);min-height:46px;margin-top:16px;border:0;border-radius:2px;background:linear-gradient(90deg,#3ea1ec,#2d6ed7);color:#eaf6ff;font-size:17px;cursor:pointer; }
		.gdl-trading-card-preview-close:hover { filter:brightness(1.12); }
	`);
}
