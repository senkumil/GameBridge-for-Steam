import { injectLibraryStyle } from './inject';

export function ensureTradingCardStyles(doc: Document): void {
	injectLibraryStyle(doc, 'gdl-trading-card-styles', `
		#gdl-trading-cards-section,#gdl-trading-cards-section > *,#gdl-trading-cards-section [role="region"],#gdl-trading-cards-content,#gdl-trading-cards-content > * { overflow:visible; }
		.gdl-trading-card-grid { display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;align-items:start;overflow:visible;perspective:900px; }
		.gdl-trading-card { --gdl-card-light-x:50%;--gdl-card-light-y:50%;position:relative;min-width:0;aspect-ratio:224/261;z-index:1;overflow:visible;cursor:pointer; }
		.gdl-trading-card-surface { position:absolute;inset:0;width:100%;height:100%;z-index:1;transform:perspective(700px) rotateX(0) rotateY(0);transform-style:preserve-3d;transform-origin:center center;transition:left .16s cubic-bezier(.2,.78,.22,1),top .16s cubic-bezier(.2,.78,.22,1),width .16s cubic-bezier(.2,.78,.22,1),height .16s cubic-bezier(.2,.78,.22,1),transform .08s linear,filter .12s ease;cursor:pointer; }
		.gdl-trading-card-surface::after { content:"";position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;background:radial-gradient(circle at var(--gdl-card-light-x) var(--gdl-card-light-y),rgba(255,255,255,.48) 0%,rgba(128,190,255,.20) 19%,rgba(255,255,255,0) 55%);mix-blend-mode:screen;transition:opacity .15s ease; }
		.gdl-trading-card.gdl-card-tilt-active { z-index:80; }
		.gdl-trading-card.gdl-card-tilt-active .gdl-trading-card-surface { filter:drop-shadow(0 14px 18px rgba(0,0,0,.72)); }
		.gdl-trading-card.gdl-card-tilt-active .gdl-trading-card-surface::after { opacity:.78; }
		.gdl-trading-card img { display:block;width:100%;height:100%;min-width:0;object-fit:contain;image-rendering:auto;box-sizing:border-box;border:0;box-shadow:0 0 5px rgba(0,0,0,.55);backface-visibility:hidden; }
		.gdl-trading-badge { width:60px;height:60px;flex:0 0 60px;padding:0;box-sizing:border-box;background:transparent;filter:drop-shadow(0 2px 4px rgba(0,0,0,.55)); }
		.gdl-trading-badge img { display:block;width:100%;height:100%;object-fit:contain;border-radius:0;image-rendering:auto; }
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
