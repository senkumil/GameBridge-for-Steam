export function ensureBigPictureModalStyles(doc: Document): void {
	const id = 'gdl-bp-modals-style';
	if (doc.getElementById(id)) return;
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = `
		/* Big Picture News / Card / Community Modals */
		.gdl-bp-news-modal-overlay {
			position: fixed;
			inset: 0;
			z-index: 10000;
			background: rgba(0, 0, 0, 0.78);
			backdrop-filter: blur(8px);
			display: flex;
			align-items: center;
			justify-content: center;
			padding: 24px;
			box-sizing: border-box;
			font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
			animation: gdl-bp-fadein 0.15s ease-out;
		}
		@keyframes gdl-bp-fadein { from { opacity: 0; } to { opacity: 1; } }
		.gdl-bp-news-modal-window {
			position: relative;
			width: 100%;
			max-width: 820px;
			max-height: 88vh;
			background: #181d24;
			border-radius: 8px;
			box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.1);
			display: flex;
			flex-direction: column;
			overflow: hidden;
			color: #e7e8ea;
		}
		.gdl-bp-news-modal-close {
			position: absolute;
			top: 14px;
			right: 14px;
			width: 36px;
			height: 36px;
			border-radius: 50%;
			background: rgba(0, 0, 0, 0.5);
			border: 1px solid rgba(255, 255, 255, 0.15);
			color: #ffffff;
			font-size: 16px;
			font-weight: bold;
			cursor: pointer;
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 10;
			transition: background 0.15s, transform 0.15s;
		}
		.gdl-bp-news-modal-close:hover {
			background: rgba(255, 255, 255, 0.2);
			transform: scale(1.08);
		}
		.gdl-bp-news-modal-banner-wrap {
			width: 100%;
			height: 220px;
			flex-shrink: 0;
			background: #000000;
			overflow: hidden;
		}
		.gdl-bp-news-modal-banner {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
		.gdl-bp-news-modal-content {
			flex: 1 1 auto;
			overflow-y: auto;
			padding: 24px 32px;
		}
		.gdl-bp-news-modal-game-header {
			display: flex;
			align-items: center;
			gap: 10px;
			margin-bottom: 8px;
		}
		.gdl-bp-news-modal-game-icon {
			width: 22px;
			height: 22px;
			border-radius: 3px;
			object-fit: cover;
		}
		.gdl-bp-news-modal-game-name {
			font-size: 14px;
			font-weight: 600;
			color: #dcdedf;
		}
		.gdl-bp-news-modal-meta {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-bottom: 12px;
			font-size: 12px;
			letter-spacing: 0.5px;
		}
		.gdl-bp-news-modal-tag {
			color: #1a9fff;
			font-weight: 700;
		}
		.gdl-bp-news-modal-date {
			color: #8f98a0;
			font-weight: 600;
		}
		.gdl-bp-news-modal-title {
			font-size: 26px;
			font-weight: 700;
			line-height: 1.25;
			color: #ffffff;
			margin: 0 0 18px;
		}
		.gdl-bp-news-modal-body {
			font-size: 15px;
			line-height: 1.6;
			color: #c6d4df;
		}
		.gdl-bp-modal-news-p {
			margin: 0 0 14px;
		}
		.gdl-bp-modal-news-img {
			max-width: 100%;
			height: auto;
			border-radius: 4px;
			margin: 12px 0;
			display: block;
		}
		.gdl-bp-modal-news-list {
			margin: 10px 0 16px 20px;
			padding: 0;
		}
		.gdl-bp-modal-news-list li {
			margin-bottom: 6px;
		}
		.gdl-bp-modal-news-link {
			color: #66c0f4;
			text-decoration: underline;
		}
		.gdl-bp-news-modal-footer {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 12px;
			padding: 14px 28px;
			background: rgba(0, 0, 0, 0.35);
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			flex-shrink: 0;
		}
		.gdl-bp-news-modal-action-btn {
			padding: 8px 18px;
			border-radius: 4px;
			background: #3d4450;
			color: #ffffff;
			font-size: 13.5px;
			font-weight: 600;
			border: 1px solid transparent;
			cursor: pointer;
			text-decoration: none;
			display: inline-flex;
			align-items: center;
			gap: 6px;
			transition: background 0.15s, border-color 0.15s;
		}
		.gdl-bp-news-modal-action-btn:hover,
		.gdl-bp-news-modal-action-btn:focus {
			background: #4c5565;
			border-color: #ffffff;
			outline: none;
		}

		/* Card Modal Specifics */
		.gdl-bp-card-modal-window {
			max-width: 580px;
		}
		.gdl-bp-card-modal-body {
			display: flex;
			flex-direction: column;
			align-items: center;
			padding: 32px 24px 24px;
			text-align: center;
		}
		.gdl-bp-card-modal-image-wrap {
			margin-bottom: 20px;
		}
		.gdl-bp-card-modal-image {
			max-width: 260px;
			height: auto;
			border-radius: 6px;
			box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
			display: block;
		}
		.gdl-bp-card-modal-info {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 6px;
		}
		.gdl-bp-card-modal-game {
			font-size: 15px;
			color: #8f98a0;
		}
		.gdl-bp-card-modal-badge {
			font-size: 13.5px;
			font-weight: 600;
			color: #1a9fff;
			margin-top: 4px;
		}

		/* Community Content & Video Modal */
		.gdl-bp-community-modal-window {
			max-width: 860px;
		}
		.gdl-bp-community-modal-window.is-video-modal {
			max-width: 960px;
		}
		.gdl-bp-community-modal-video-wrap {
			position: relative;
			width: 100%;
			padding-top: 56.25%;
			background: #000000;
		}
		.gdl-bp-community-modal-iframe {
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			border: 0;
		}
		.gdl-bp-community-modal-img-wrap {
			width: 100%;
			max-height: 520px;
			background: #0d1015;
			display: flex;
			align-items: center;
			justify-content: center;
			overflow: hidden;
		}
		.gdl-bp-community-modal-img {
			max-width: 100%;
			max-height: 520px;
			object-fit: contain;
			display: block;
		}
		.gdl-bp-community-modal-content {
			padding: 20px 28px;
		}

		/* Fullscreen Trading Card Showcase Modal */
		.gdl-bp-fullscreen-card-modal {
			position: fixed !important;
			inset: 0 !important;
			width: 100vw !important;
			height: 100vh !important;
			z-index: 999999 !important;
			background: radial-gradient(circle at center, rgba(30, 36, 46, 0.98) 0%, rgba(12, 15, 20, 0.99) 100%) !important;
			display: flex !important;
			align-items: center !important;
			justify-content: center !important;
			box-sizing: border-box !important;
			animation: gdl-bp-fadein 0.18s ease-out;
		}
		.gdl-bp-fullscreen-card-inner {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: 20px;
			max-width: 90vw;
		}
		.gdl-bp-fullscreen-card-art-container {
			position: relative;
		}
		.gdl-bp-fullscreen-card-art-container.is-foil::after {
			content: "";
			position: absolute;
			inset: 0;
			background: linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 40%, rgba(255,255,255,0.3) 60%, transparent 100%);
			pointer-events: none;
			mix-blend-mode: overlay;
			border-radius: 6px;
		}
		.gdl-bp-fullscreen-card-img {
			max-height: 60vh;
			max-width: 80vw;
			width: auto;
			object-fit: contain;
			filter: drop-shadow(0 20px 50px rgba(0, 0, 0, 0.9));
			border-radius: 6px;
		}
		.gdl-bp-fullscreen-card-details {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 6px;
		}
		.gdl-bp-fullscreen-card-tag {
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 1px;
			color: #8f98a0;
			text-transform: uppercase;
		}
		.gdl-bp-fullscreen-card-title {
			font-size: 32px;
			font-weight: 800;
			color: #ffffff;
			margin: 0;
		}
		.gdl-bp-fullscreen-card-game {
			font-size: 15px;
			color: #8f98a0;
		}
		.gdl-bp-fullscreen-card-badge {
			font-size: 15px;
			color: #b8bcbf;
			margin-top: 2px;
		}
		.gdl-bp-fullscreen-card-footer {
			margin-top: 14px;
		}

		/* Fullscreen Achievements Screen (Native Big Picture match) */
		.gdl-bp-ach-screen {
			position: fixed !important;
			inset: 0 !important;
			width: 100vw !important;
			height: 100vh !important;
			z-index: 9999999 !important;
			background: #0e141b !important;
			overflow-y: auto !important;
			overflow-x: hidden !important;
			padding: 40px 60px 48px !important;
			box-sizing: border-box !important;
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, Arial, sans-serif !important;
			color: #e7e8ea !important;
			animation: gdl-bp-fadein 0.15s ease-out;
		}
		.gdl-bp-ach-screen-backdrop {
			position: fixed;
			top: 0;
			left: 0;
			right: 0;
			height: 480px;
			background-size: cover;
			background-position: center top;
			filter: blur(48px) brightness(0.32);
			opacity: 0.70;
			pointer-events: none;
			z-index: 0;
		}
		.gdl-bp-ach-screen-inner {
			position: relative;
			z-index: 1;
			max-width: 1360px;
			margin: 0 auto;
			display: flex;
			flex-direction: column;
			gap: 14px;
		}
		.gdl-bp-ach-screen-header {
			display: flex;
			align-items: flex-start;
			gap: 28px;
			margin-bottom: 4px;
		}
		.gdl-bp-ach-screen-portrait {
			width: 136px;
			height: 204px;
			min-width: 136px;
			object-fit: cover;
			border-radius: 4px;
			box-shadow: 0 10px 32px rgba(0, 0, 0, 0.85);
			flex-shrink: 0;
		}
		.gdl-bp-ach-screen-header-info {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 12px;
			padding-top: 4px;
		}
		.gdl-bp-ach-screen-game-title {
			font-size: 28px;
			font-weight: 700;
			color: #ffffff;
			margin: 0 0 4px;
			line-height: 1.2;
		}
		.gdl-bp-ach-screen-progress-wrap {
			display: flex;
			flex-direction: column;
			gap: 8px;
			width: 100%;
			box-sizing: border-box;
		}
		.gdl-bp-ach-screen-progress-top-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 24px;
			width: 100%;
		}
		.gdl-bp-ach-screen-progress-headline {
			display: flex;
			align-items: center;
			gap: 10px;
			font-size: 13.5px;
			font-weight: 700;
			color: #ffffff;
			letter-spacing: 0.5px;
			text-transform: uppercase;
		}
		.gdl-bp-ach-screen-medal {
			width: 26px;
			height: 32px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			flex-shrink: 0;
		}
		.gdl-bp-ach-screen-medal svg {
			width: 26px;
			height: 32px;
			display: block;
		}
		.gdl-bp-ach-screen-pct {
			color: #8f98a0;
			font-weight: 600;
			margin-left: 4px;
		}
		.gdl-bp-ach-screen-progress-track {
			width: 100%;
			height: 7px;
			background: rgba(255, 255, 255, 0.14);
			border-radius: 4px;
			overflow: hidden;
			margin-top: 2px;
		}
		.gdl-bp-ach-screen-progress-fill {
			height: 100%;
			background: #1a9fff;
			border-radius: 4px;
		}
		.gdl-bp-ach-screen-stat-meta {
			display: flex;
			align-items: center;
			gap: 24px;
			flex-shrink: 0;
		}
		.gdl-bp-ach-screen-stat-item {
			display: flex;
			align-items: baseline;
			gap: 6px;
		}
		.gdl-bp-ach-screen-stat-label {
			font-size: 11px;
			font-weight: 700;
			color: #8f98a0;
			letter-spacing: 0.6px;
			text-transform: uppercase;
		}
		.gdl-bp-ach-screen-stat-val {
			font-size: 13.5px;
			font-weight: 700;
			color: #ffffff;
		}
		.gdl-bp-ach-screen-tabs {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 14px;
			margin: 16px 0 14px;
		}
		.gdl-bp-ach-tab-btn {
			background: transparent;
			border: none;
			color: #8f98a0;
			font-size: 13.5px;
			font-weight: 800;
			letter-spacing: 0.6px;
			text-transform: uppercase;
			padding: 7px 22px;
			border-radius: 20px;
			cursor: pointer;
			outline: none;
			transition: all 0.15s ease;
		}
		.gdl-bp-ach-tab-btn.active {
			background: rgba(255, 255, 255, 0.20) !important;
			color: #ffffff !important;
		}
		.gdl-bp-ach-tab-btn:hover,
		.gdl-bp-ach-tab-btn:focus,
		.gdl-bp-ach-tab-btn.gpfocus {
			color: #ffffff !important;
			outline: 2px solid #ffffff !important;
		}
		.gdl-bp-ach-screen-toolbar {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: 12px;
			margin-bottom: 8px;
		}
		.gdl-bp-ach-search-wrap {
			display: flex;
			align-items: center;
			position: relative;
		}
		.gdl-bp-ach-search-input {
			background: rgba(0, 0, 0, 0.35);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 4px;
			color: #ffffff;
			font-size: 13px;
			padding: 7px 14px;
			width: 220px;
			outline: none;
			transition: border-color 0.15s ease, box-shadow 0.15s ease;
		}
		.gdl-bp-ach-search-input:focus,
		.gdl-bp-ach-search-input.gpfocus {
			border-color: #ffffff;
			outline: 2px solid #ffffff;
		}
		.gdl-bp-ach-compare-btn {
			display: flex;
			align-items: center;
			gap: 8px;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.1);
			border-radius: 4px;
			color: #8f98a0;
			font-size: 13px;
			padding: 7px 14px;
			cursor: pointer;
			outline: none;
			transition: all 0.15s ease;
		}
		.gdl-bp-ach-compare-btn:hover,
		.gdl-bp-ach-compare-btn:focus,
		.gdl-bp-ach-compare-btn.gpfocus {
			color: #ffffff;
			border-color: #ffffff;
			outline: 2px solid #ffffff;
		}
		.gdl-bp-ach-caret {
			font-size: 10px;
			color: #8f98a0;
		}
		.gdl-bp-ach-screen-list {
			display: flex;
			flex-direction: column;
			gap: 6px;
		}
		.gdl-bp-ach-row {
			background: #1b2129;
			border: 1px solid rgba(255, 255, 255, 0.04);
			border-radius: 4px;
			padding: 12px 18px;
			display: flex;
			align-items: center;
			gap: 16px;
			margin-bottom: 6px;
			cursor: pointer;
			outline: none;
			transition: background 0.12s ease, border-color 0.12s ease, transform 0.1s ease;
		}
		.gdl-bp-ach-row:hover,
		.gdl-bp-ach-row:focus,
		.gdl-bp-ach-row.gpfocus,
		.gdl-bp-ach-row[data-focus="true"] {
			background: #232c37 !important;
			border-color: #ffffff !important;
			outline: 2px solid #ffffff !important;
			box-shadow: 0 0 16px rgba(255, 255, 255, 0.2) !important;
			transform: scale(1.006);
		}
		.gdl-bp-ach-row-icon-frame {
			width: 58px;
			height: 58px;
			min-width: 58px;
			flex-shrink: 0;
			border-radius: 3px;
			overflow: hidden;
			background: #000000;
		}
		.gdl-bp-ach-row-icon {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
		.gdl-bp-ach-row-icon.is-locked {
			opacity: 0.40;
			filter: grayscale(1);
		}
		.gdl-bp-ach-row-body {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
		}
		.gdl-bp-ach-row-title {
			font-size: 15.5px;
			font-weight: 700;
			color: #ffffff;
			margin-bottom: 2px;
		}
		.gdl-bp-ach-row-desc {
			font-size: 13px;
			color: #8f98a0;
			line-height: 1.35;
			margin-bottom: 2px;
		}
		.gdl-bp-ach-row-global {
			font-size: 11.5px;
			color: #707b88;
		}
		.gdl-bp-ach-row-status {
			display: flex;
			flex-direction: column;
			align-items: flex-end;
			gap: 4px;
			min-width: 180px;
			flex-shrink: 0;
		}
		.gdl-bp-ach-row-unlocked-at {
			font-size: 12px;
			color: #8f98a0;
			text-align: right;
		}
		.gdl-bp-ach-row-bar-done {
			width: 150px;
			height: 4px;
			background: #1a9fff;
			border-radius: 2px;
			margin-top: 6px;
		}
		.gdl-bp-ach-row-locked-badge {
			font-size: 12px;
			color: #707b88;
			font-weight: 600;
		}
		.gdl-bp-ach-empty {
			text-align: center;
			padding: 40px;
			color: #8f98a0;
			font-size: 15px;
		}
		.gdl-bp-ach-screen-footer {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 18px 0 8px;
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			margin-top: 14px;
		}
		.gdl-bp-ach-screen-footer-right {
			display: flex;
			align-items: center;
			gap: 24px;
		}
		.gdl-bp-footer-prompt {
			display: flex;
			align-items: center;
			gap: 8px;
			color: #ffffff;
			font-size: 13px;
			font-weight: 700;
			cursor: pointer;
		}
		.gdl-bp-xbox-icon {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			color: #ffffff;
			opacity: 0.9;
		}
		.gdl-bp-key-badge {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 22px;
			height: 22px;
			border-radius: 50%;
			background: rgba(255, 255, 255, 0.22);
			color: #ffffff;
			font-size: 12px;
			font-weight: 800;
		}
		.gdl-bp-key-badge.badge-a {
			background: #5cba47;
			color: #ffffff;
		}
		.gdl-bp-key-badge.badge-b {
			background: #d94b4b;
			color: #ffffff;
		}
	`;
	(doc.head || doc.documentElement).appendChild(style);
}
