import { ensureBigPictureModalStyles } from './modal-styles';

export function ensureBigPictureDetailsStyles(doc: Document): void {
	ensureBigPictureModalStyles(doc);
	const id = 'gdl-bp-details-style';
	if (doc.getElementById(id)) return;
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = `
		#gdl-bp-detail-root {
			font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
			box-sizing: border-box;
			display: block;
			position: relative;
			z-index: 10;
			width: 100%;
			max-width: 1280px;
			min-height: 320px;
			margin: 0 auto;
			padding: 24px 0 96px;
			color: var(--gp-text-color-body, #e7e8ea);
			background: transparent;
		}
		#gdl-bp-detail-root * { box-sizing: border-box; }
		#gdl-bp-detail-root a { color: inherit; text-decoration: none; }
		#gdl-bp-detail-root .gdl-bp-section { margin: 0 0 32px; }

		/* Universal Steam Gamepad Focus Ring */
		#gdl-bp-detail-root .Focusable:focus,
		#gdl-bp-detail-root .Focusable.gpfocus,
		#gdl-bp-detail-root .Focusable[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 8px 24px rgba(0, 0, 0, 0.7) !important;
			transform: scale(1.02) !important;
			outline: none !important;
			z-index: 3;
		}

		/* Golden Rare Achievement Glow */
		@keyframes gdl-bp-rare-pulse {
			0%, 100% { opacity: .20; transform: scale(.80); filter: blur(2px); }
			15% { opacity: .94; transform: scale(1.15); filter: blur(6.8px); }
			31% { opacity: .40; transform: scale(.90); filter: blur(3.2px); }
			49% { opacity: 1; transform: scale(1.27); filter: blur(9.4px); }
			66% { opacity: .48; transform: scale(.94); filter: blur(3.8px); }
			83% { opacity: 1; transform: scale(1.17); filter: blur(7.2px); }
		}

		#gdl-bp-detail-root .gdl-bp-section-title {
			margin: 0 0 14px;
			font-size: 22px;
			line-height: 28px;
			font-weight: 700;
			color: var(--gp-text-color-primary, #f3f4f5);
		}

		/* Activity Feed */
		#gdl-bp-detail-root .gdl-bp-feed-group { margin-bottom: 24px; }
		#gdl-bp-detail-root .gdl-bp-feed-list { display: flex; flex-direction: column; gap: 10px; }
		#gdl-bp-detail-root .gdl-bp-feed-card {
			background: var(--gp-color-card, rgba(25, 30, 38, 0.7));
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 6px;
			padding: 16px;
			display: flex;
			gap: 20px;
			align-items: stretch;
			text-decoration: none;
			color: inherit;
			outline: none;
			transition: transform 0.15s ease, box-shadow 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-feed-thumb-wrap {
			width: 320px;
			min-width: 320px;
			height: 180px;
			border-radius: 4px;
			overflow: hidden;
			background: var(--gp-color-thumb-bg, #15191f);
			flex-shrink: 0;
		}
		#gdl-bp-detail-root .gdl-bp-feed-thumb { width: 100%; height: 100%; object-fit: cover; }
		#gdl-bp-detail-root .gdl-bp-feed-icon-wrap {
			flex: 0 0 54px;
			width: 54px;
			height: 54px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: var(--gp-text-color-secondary, #8f98a0);
			align-self: center;
		}
		#gdl-bp-detail-root .gdl-bp-feed-avatar {
			width: 48px;
			height: 48px;
			border-radius: 4px;
			object-fit: cover;
			flex-shrink: 0;
			background: var(--gp-color-avatar-bg, #191e25);
		}
		#gdl-bp-detail-root .gdl-bp-feed-body { flex: 1; min-width: 0; }
		#gdl-bp-detail-root .gdl-bp-feed-eyebrow {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: var(--gp-text-color-secondary, #8f98a0);
			text-transform: uppercase;
		}
		#gdl-bp-detail-root .gdl-bp-feed-title {
			font-size: 20px;
			font-weight: 700;
			color: #ffffff;
			line-height: 1.3;
		}
		#gdl-bp-detail-root .gdl-bp-feed-desc {
			font-size: 14px;
			color: var(--gp-text-color-secondary, #b8bcbf);
			line-height: 1.45;
			margin-top: 4px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-meta {
			display: flex;
			align-items: center;
			gap: 14px;
			color: var(--gp-text-color-secondary, #8f98a0);
			font-size: 13px;
			margin-top: 8px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-section {
			display: flex;
			gap: 12px;
			align-items: center;
			margin-bottom: 20px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-input-wrap { flex: 1; min-width: 0; }
		#gdl-bp-detail-root .gdl-bp-feed-post-input {
			width: 100%;
			background: rgba(255, 255, 255, 0.07);
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 4px;
			color: #ffffff;
			font-size: 15px;
			padding: 10px 14px;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-feed-jump-news,
		#gdl-bp-detail-root .gdl-bp-feed-load-more-btn {
			background: rgba(255, 255, 255, 0.1);
			color: #ffffff;
			font-size: 14px;
			font-weight: 600;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 4px;
			padding: 8px 20px;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-date-heading-wrap {
			border-top: 1px solid rgba(255, 255, 255, 0.08);
			padding-top: 18px;
			margin-top: 24px;
			margin-bottom: 12px;
		}
		#gdl-bp-detail-root .gdl-bp-date-heading {
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: var(--gp-text-color-secondary, #8f98a0);
			text-transform: uppercase;
		}

		/* Achievements Section */
		#gdl-bp-detail-root .gdl-bp-achievements-shell {
			background: var(--gp-color-card, rgba(31, 36, 44, 0.82));
			border-radius: 6px;
			overflow: hidden;
		}
		#gdl-bp-detail-root .gdl-bp-ach-progress {
			display: grid;
			grid-template-columns: auto minmax(0, 1fr);
			gap: 16px;
			align-items: center;
			padding: 10px 18px;
			background: var(--gp-color-card-dark, rgba(24, 30, 38, 0.88));
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-medal { width: 44px; height: 50px; display: flex; align-items: center; justify-content: center; }
		#gdl-bp-detail-root .gdl-bp-ach-progress-label { font-size: 18px; color: var(--gp-text-color-body, #dcdfe3); }
		#gdl-bp-detail-root .gdl-bp-ach-progress-label strong { color: #ffffff; }
		#gdl-bp-detail-root .gdl-bp-progress-track {
			height: 8px;
			border-radius: 2px;
			background: var(--gp-progress-track, #3d444c);
			margin-top: 6px;
			overflow: hidden;
		}
		#gdl-bp-detail-root .gdl-bp-progress-fill { height: 100%; background: var(--gp-color-blue, #1a9fff); }
		#gdl-bp-detail-root .gdl-bp-ach-strip {
			display: grid;
			grid-template-columns: minmax(360px, 1.15fr) minmax(0, 1fr);
			gap: 12px;
			padding: 18px 14px;
			align-items: center;
		}
		#gdl-bp-detail-root .gdl-bp-ach-featured {
			display: grid;
			grid-template-columns: 80px minmax(0, 1fr);
			gap: 14px;
			padding: 10px;
			background: rgba(75, 83, 95, 0.65);
			border-radius: 4px;
			align-items: center;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame {
			position: relative;
			width: 80px;
			height: 80px;
			flex: 0 0 80px;
			display: flex;
			align-items: center;
			justify-content: center;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
		#gdl-bp-detail-root .gdl-bp-ach-featured strong { font-size: 17px; line-height: 22px; color: #ffffff; }
		#gdl-bp-detail-root .gdl-bp-ach-featured p { margin: 2px 0; font-size: 14px; color: var(--gp-text-color-secondary, #aeb3ba); }
		#gdl-bp-detail-root .gdl-bp-ach-icons { display: flex; gap: 8px; align-items: center; overflow: hidden; }
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame {
			position: relative;
			width: 76px;
			height: 76px;
			flex: 0 0 76px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: #0f1720;
			border-radius: 4px;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-ach-icon { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
		#gdl-bp-detail-root .gdl-bp-ach-icon.is-locked { filter: grayscale(1) brightness(0.4); }
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-rare-glow,
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-rare-glow {
			display: block;
			position: absolute;
			inset: -6px;
			border-radius: 8px;
			background: radial-gradient(ellipse at center, rgba(255,235,116,.70) 0%, rgba(255,183,46,.58) 38%, transparent 76%);
			filter: blur(6px);
			animation: gdl-bp-rare-pulse 15s cubic-bezier(.42,0,.32,1) infinite;
		}
		#gdl-bp-detail-root .gdl-bp-ach-footer-prompt-bar {
			padding: 10px 16px 14px;
			display: flex;
			justify-content: flex-end;
		}
		#gdl-bp-detail-root .gdl-bp-footer-prompt {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			padding: 6px 14px;
			border-radius: 4px;
			font-size: 14px;
			font-weight: 600;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-key-badge {
			background: #ffffff;
			color: #1a1e24;
			width: 22px;
			height: 22px;
			border-radius: 50%;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: 12px;
			font-weight: 700;
		}

		/* Trading Cards */
		#gdl-bp-detail-root .gdl-bp-cards-shell {
			background: var(--gp-color-card, rgba(57, 62, 71, 0.82));
			border-radius: 6px;
			overflow: hidden;
		}
		#gdl-bp-detail-root .gdl-bp-badge-row {
			min-height: 80px;
			background: var(--gp-color-card-dark, rgba(31, 36, 44, 0.88));
			display: flex;
			align-items: center;
			gap: 16px;
			padding: 10px 16px;
		}
		#gdl-bp-detail-root .gdl-bp-badge-img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; }
		#gdl-bp-detail-root .gdl-bp-badge-copy { font-size: 16px; color: #c9ccd1; }
		#gdl-bp-detail-root .gdl-bp-card-row { display: flex; gap: 12px; padding: 16px; flex-wrap: wrap; }
		#gdl-bp-detail-root .gdl-bp-card-item {
			width: 110px;
			border-radius: 4px;
			overflow: hidden;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-card-item img { width: 100%; height: auto; display: block; }
		#gdl-bp-detail-root .gdl-bp-card-item.is-locked { filter: grayscale(1) brightness(0.4); }
		#gdl-bp-detail-root .gdl-bp-card-count { padding: 0 16px; font-size: 13px; font-weight: 700; color: #8f98a0; }

		/* Media & Notes */
		#gdl-bp-detail-root .gdl-bp-media-box,
		#gdl-bp-detail-root .gdl-bp-notes-box {
			background: var(--gp-color-card, rgba(57, 62, 71, 0.82));
			padding: 24px 16px;
			border-radius: 6px;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		#gdl-bp-detail-root .gdl-bp-action-button,
		#gdl-bp-detail-root .gdl-bp-info-link {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-height: 44px;
			padding: 0 24px;
			background: var(--gp-button-bg, #454d5a);
			color: var(--gp-text-color-primary, #f1f2f3);
			font-size: 16px;
			font-weight: 600;
			border: 0;
			border-radius: 4px;
			cursor: pointer;
			outline: none;
		}

		/* Community Videos & Guides */
		#gdl-bp-detail-root .gdl-bp-community-videos-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 18px;
			margin-bottom: 24px;
		}
		#gdl-bp-detail-root .gdl-bp-community-video-card,
		#gdl-bp-detail-root .gdl-bp-community-guide-card {
			background: var(--gp-color-card, rgba(25, 30, 38, 0.75));
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 6px;
			padding: 12px;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-community-media-wrap {
			position: relative;
			aspect-ratio: 16 / 9;
			border-radius: 4px;
			overflow: hidden;
			background: #10141a;
		}
		#gdl-bp-detail-root .gdl-bp-community-media { width: 100%; height: 100%; object-fit: cover; }
		#gdl-bp-detail-root .gdl-bp-community-play-icon {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 32px;
			color: #ffffff;
			background: rgba(0, 0, 0, 0.35);
		}
		#gdl-bp-detail-root .gdl-bp-community-title { font-size: 16px; font-weight: 600; color: #ffffff; margin-top: 8px; }
		#gdl-bp-detail-root .gdl-bp-community-author {
			display: flex;
			align-items: center;
			gap: 8px;
			margin-top: 6px;
			font-size: 13px;
			color: #8f98a0;
		}
		#gdl-bp-detail-root .gdl-bp-community-author img { width: 20px; height: 20px; border-radius: 50%; }
		#gdl-bp-detail-root .gdl-bp-community-guides-grid {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 16px;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; }

		/* Game Info Grid */
		#gdl-bp-detail-root .gdl-bp-info-grid {
			display: grid;
			grid-template-columns: 220px minmax(0, 1fr) 280px;
			gap: 24px;
			align-items: start;
		}
		#gdl-bp-detail-root .gdl-bp-info-portrait { width: 100%; border-radius: 6px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6); }
		#gdl-bp-detail-root .gdl-bp-info-description { font-size: 15px; line-height: 1.5; color: #d0d3d7; }
		#gdl-bp-detail-root .gdl-bp-info-meta { font-size: 14px; line-height: 1.6; color: #8f98a0; margin-top: 14px; }
		#gdl-bp-detail-root .gdl-bp-info-meta strong { color: #ffffff; }
		#gdl-bp-detail-root .gdl-bp-feature { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 14px; color: #e1e3e6; }
		#gdl-bp-detail-root .gdl-bp-info-links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px; }

		/* Friends Section */
		#gdl-bp-detail-root .gdl-bp-friends-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
		#gdl-bp-detail-root .gdl-bp-friends-col-header { font-size: 13px; font-weight: 700; color: #8f98a0; margin-bottom: 10px; }
		#gdl-bp-detail-root .gdl-bp-friends-avatar-row { display: flex; gap: 8px; flex-wrap: wrap; }
		#gdl-bp-detail-root .gdl-bp-friend-card {
			width: 44px;
			height: 44px;
			border-radius: 4px;
			overflow: hidden;
			cursor: pointer;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-friend-avatar { width: 100%; height: 100%; object-fit: cover; }
		#gdl-bp-detail-root .gdl-bp-empty { color: #8f98a0; font-size: 15px; padding: 20px 0; }

		@media (max-width: 1100px) {
			#gdl-bp-detail-root .gdl-bp-community-videos-grid { grid-template-columns: 1fr; }
			#gdl-bp-detail-root .gdl-bp-community-guides-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
			#gdl-bp-detail-root .gdl-bp-info-grid { grid-template-columns: 180px 1fr; }
			#gdl-bp-detail-root .gdl-bp-friends-grid { grid-template-columns: 1fr; }
		}
	`;
	(doc.head || doc.documentElement).appendChild(style);
}
