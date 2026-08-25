import { injectAchievementStyle } from './inject';

export function ensureAchievementModalStyles(doc: Document): void {
	injectAchievementStyle(doc, 'gdl-achievement-modal-style', `
		/* Modal styles matching native Steam dialog */
		#gdl-local-achievement-modal {
			position: fixed;
			inset: 0;
			z-index: 2147483600;
			background: rgba(0, 0, 0, 0.72);
			backdrop-filter: blur(4px);
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
			color: #d6d7d8;
			animation: gdl-lam-fadein 0.15s ease-out;
		}
		@keyframes gdl-lam-fadein {
			from { opacity: 0; }
			to { opacity: 1; }
		}
		@keyframes gdl-lam-popin {
			from { transform: scale(0.96); opacity: 0; }
			to { transform: scale(1); opacity: 1; }
		}
		.gdl-lam-window {
			width: min(840px, 92vw);
			height: min(680px, 88vh);
			background: #171d24;
			border: 1px solid rgba(255, 255, 255, 0.08);
			box-shadow: 0 20px 65px rgba(0, 0, 0, 0.85);
			border-radius: 4px;
			position: relative;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			animation: gdl-lam-popin 0.15s ease-out;
		}
		.gdl-lam-head {
			padding: 24px 28px 16px;
			background: linear-gradient(180deg, #2a2221 0%, #1c222b 100%);
			position: relative;
			border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		}
		.gdl-lam-title {
			display: flex;
			align-items: center;
			gap: 12px;
			color: #ffffff;
			font-size: 20px;
			font-weight: 700;
			padding-right: 48px;
		}
		.gdl-lam-game-icon {
			width: 34px;
			height: 34px;
			object-fit: cover;
			border-radius: 3px;
			background: #17202b;
			flex-shrink: 0;
		}
		.gdl-lam-close {
			position: absolute;
			right: 18px;
			top: 18px;
			width: 36px;
			height: 36px;
			border-radius: 50%;
			border: 1px solid rgba(255, 255, 255, 0.12);
			background: #232932;
			color: #c5c9ce;
			font-size: 22px;
			display: flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
			transition: background 0.15s ease, color 0.15s ease;
		}
		.gdl-lam-close:hover {
			background: #3a424e;
			color: #ffffff;
		}
		.gdl-lam-progressbox {
			margin-top: 16px;
		}
		.gdl-lam-progressline {
			display: flex;
			justify-content: space-between;
			font-size: 13px;
			color: #d6d7d8;
			font-weight: 700;
			letter-spacing: 0.5px;
			text-transform: uppercase;
		}
		.gdl-lam-track {
			height: 8px;
			margin-top: 8px;
			background: rgba(255, 255, 255, 0.15);
			border-radius: 4px;
			overflow: hidden;
		}
		.gdl-lam-fill {
			height: 100%;
			background: #1a9fff;
			border-radius: 4px;
			transition: width 0.3s ease;
		}
		.gdl-lam-tabs {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 12px;
			margin-top: 16px;
		}
		.gdl-lam-tab {
			border: 0;
			background: transparent;
			color: #ffffff;
			font-weight: 700;
			font-size: 13px;
			letter-spacing: 0.5px;
			text-transform: uppercase;
			padding: 8px 24px;
			border-radius: 20px;
			cursor: pointer;
			transition: all 0.15s ease;
		}
		.gdl-lam-tab:hover {
			background: rgba(255, 255, 255, 0.08);
			color: #ffffff;
		}
		.gdl-lam-tab.active {
			background: #6a3622;
			color: #ffffff;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}
		.gdl-lam-toolbar {
			display: flex;
			justify-content: flex-end;
			padding: 12px 28px 4px;
			background: #171d24;
		}
		.gdl-lam-search {
			width: 200px;
			background: #13171d;
			border: 1px solid #232a35;
			border-radius: 3px;
			color: #8f98a0;
			padding: 7px 12px;
			font-size: 13px;
			font-style: italic;
			outline: none;
			transition: border-color 0.2s, box-shadow 0.2s;
		}
		.gdl-lam-search:focus {
			border-color: #1a9fff;
			color: #e1e5ea;
		}
		.gdl-lam-list {
			flex: 1;
			overflow-y: auto;
			padding: 8px 28px 24px;
			background: #171d24;
		}
		.gdl-lam-row {
			min-height: 80px;
			background: #1f252e;
			margin-bottom: 6px;
			display: flex;
			align-items: center;
			padding: 12px 16px;
			gap: 16px;
			border: 1px solid rgba(255, 255, 255, 0.02);
			border-radius: 2px;
			transition: background 0.12s ease;
		}
		.gdl-lam-row:hover {
			background: #262d38;
		}
		.gdl-lam-row-icon {
			width: 64px;
			height: 64px;
			flex: 0 0 64px;
			object-fit: cover;
			background: #121820;
			border-radius: 2px;
			box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
		}
		.gdl-lam-row-icon.locked {
			filter: grayscale(1) brightness(0.48);
			opacity: 0.85;
		}
		.gdl-lam-row-main {
			min-width: 0;
			flex: 1;
		}
		.gdl-lam-row-title {
			font-size: 15px;
			font-weight: 700;
			color: #ffffff;
		}
		.gdl-lam-row-desc {
			font-size: 13px;
			color: #8f98a0;
			margin-top: 2px;
			line-height: 17px;
		}
		.gdl-lam-row-global {
			font-size: 12px;
			color: #8f98a0;
			margin-top: 3px;
		}
		.gdl-lam-row-right {
			min-width: 200px;
			text-align: right;
			color: #8f98a0;
			font-size: 12px;
			line-height: 17px;
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			justify-content: center;
		}
		.gdl-lam-partial {
			margin-top: 7px;
		}
		.gdl-lam-partial-track {
			height: 4px;
			background: #0d1217;
			border-radius: 2px;
			overflow: hidden;
		}
		.gdl-lam-partial-fill {
			height: 100%;
			background: #1a9fff;
		}
		.gdl-lam-empty {
			text-align: center;
			color: #7f8790;
			padding: 60px 10px;
			font-size: 15px;
		}
	`);
}
