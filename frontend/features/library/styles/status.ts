import { POST_CLASSES } from '../../../steam/css';
import { injectLibraryStyle } from './inject';

export function ensureStatusComposerStyles(doc: Document): void {
	const post = POST_CLASSES();
	injectLibraryStyle(doc, 'gdl-status-composer-styles', `
		.gdl-status-box-container { display:block;margin:0 0 20px;min-height:0;height:auto;position:relative;z-index:50;overflow:visible; }
		#gdl-game-data .${post.PostTextEntryArea},
		.gdl-status-box-container textarea {
			width: 100% !important;
			height: 46px !important;
			min-height: 46px !important;
			background: rgba(0, 0, 0, 0.22) !important;
			border: 1px solid rgba(255, 255, 255, 0.05) !important;
			border-radius: 3px !important;
			color: #d6d7d8 !important;
			font-family: "Motiva Sans", Arial, Helvetica, sans-serif !important;
			font-size: 13.5px !important;
			padding: 12px 14px !important;
			box-sizing: border-box !important;
			resize: none !important;
			outline: none !important;
			transition: height 0.24s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.15s, background 0.15s !important;
		}
		#gdl-game-data .${post.PostTextEntryArea}::placeholder,
		.gdl-status-box-container textarea::placeholder {
			font-style: italic !important;
			color: #8f98a0 !important;
			font-size: 13.5px !important;
			font-family: "Motiva Sans", Arial, sans-serif !important;
		}
		#gdl-game-data .${post.PostTextEntryArea}:focus,
		.gdl-status-box-container textarea:focus,
		.gdl-status-box-container.gdl-composer-active textarea {
			height: 86px !important;
			background: rgba(0, 0, 0, 0.35) !important;
			border-color: rgba(255, 255, 255, 0.12) !important;
		}
		#gdl-game-data .${post.Controls},
		.gdl-status-box-container .${post.Controls} {
			display: flex !important;
			align-items: center !important;
			justify-content: flex-end !important;
			gap: 8px !important;
			max-height: 0px !important;
			opacity: 0 !important;
			transform: translateY(-6px) !important;
			overflow: hidden !important;
			pointer-events: none !important;
			margin-top: 0px !important;
			position: relative !important;
			z-index: 51 !important;
			transition: max-height 0.24s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.24s ease, margin-top 0.24s ease !important;
		}
		#gdl-game-data .${post.Controls}.${post.Active},
		.gdl-status-box-container .${post.Controls}.${post.Active},
		.gdl-status-box-container.gdl-composer-active .${post.Controls} {
			max-height: 50px !important;
			opacity: 1 !important;
			transform: translateY(0) !important;
			overflow: visible !important;
			pointer-events: auto !important;
			margin-top: 10px !important;
		}
		#gdl-game-data .${post.EmoticonButton},
		.gdl-status-box-container .${post.EmoticonButton},
		.gdl-emoticon-btn { background:#232a33;border:1px solid rgba(255,255,255,.06);border-radius:2px;width:38px;height:38px;display:flex;align-items:center;justify-content:center;color:#8f98a0;cursor:pointer;position:relative;transition:background .15s,color .15s; }
		#gdl-game-data .${post.EmoticonButton}:hover,
		.gdl-status-box-container .${post.EmoticonButton}:hover,
		.gdl-emoticon-btn:hover { background:#323c4a;color:#fff; }
		#gdl-game-data .${post.PostButton},
		.gdl-status-box-container .${post.PostButton},
		#gdl-status-post { background:#232a33;border:1px solid rgba(255,255,255,.05);border-radius:2px;color:#8f98a0;font-family:"Motiva Sans",Arial,Helvetica,sans-serif;font-size:14px;font-weight:500;padding:8px 26px;height:38px;cursor:default;opacity:1;transition:background .15s,color .15s,border-color .15s; }
		#gdl-game-data .${post.PostButton}.${post.Enabled},
		.gdl-status-box-container .${post.PostButton}.${post.Enabled},
		#gdl-status-post.is-enabled { background:#1a9fff;border-color:#1a9fff;color:#fff;font-weight:700;cursor:pointer; }
		#gdl-game-data .${post.PostButton}.${post.Enabled}:hover,
		.gdl-status-box-container .${post.PostButton}.${post.Enabled}:hover,
		#gdl-status-post.is-enabled:hover { background:#38b6ff;border-color:#38b6ff; }
		#gdl-emoticon-picker { position:absolute;bottom:calc(100% + 8px);right:0;width:290px;background:#232932;border:1px solid rgba(255,255,255,.16);box-shadow:0 16px 48px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.1);border-radius:4px;padding:14px 16px;z-index:999999;font-family:"Motiva Sans",Arial,Helvetica,sans-serif;color:#d6d7d8;animation:gdl-ep-popin .12s ease-out;box-sizing:border-box; }
		@keyframes gdl-ep-popin { from { transform:scale(.95);opacity:0; } to { transform:scale(1);opacity:1; } }
		.gdl-ep-heading { font-size:11px;font-weight:700;color:#8f98a0;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px; }
		.gdl-ep-grid { display:flex;flex-wrap:wrap;gap:8px; }
		.gdl-ep-item { width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;border-radius:3px;background:rgba(0,0,0,.2);transition:background .1s,transform .1s;user-select:none; }
		.gdl-ep-item:hover { background:rgba(255,255,255,.15);transform:scale(1.15); }
		.gdl-ep-search { width:100%;background:#191e25;border:1px solid #14181f;border-radius:3px;color:#8f98a0;padding:7px 10px;font-size:12px;font-style:italic;outline:none;margin-top:12px;box-sizing:border-box; }
		.gdl-ep-search:focus { border-color:#1a9fff;color:#fff; }
	`);
}
