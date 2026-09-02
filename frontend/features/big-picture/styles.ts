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
			display: block !important;
			visibility: visible !important;
			opacity: 1 !important;
			position: relative;
			z-index: 10;
			width: calc(100% - 54px);
			max-width: 1280px;
			min-height: 320px;
			flex: 1 1 100%;
			align-self: stretch;
			margin: 0 auto;
			padding: 36px 0 108px;
			color: #e7e8ea;
			background: transparent;
		}
		[data-gdl-bp-native-panel="1"]:not([class*="Tab"]):not([role="tablist"]) > :not(#gdl-bp-detail-root):not([class*="Tab"]):not([role="tablist"]) {
			display: none !important;
		}
		#gdl-bp-detail-fallback-panel {
			display: block !important;
			position: relative;
			width: 100%;
			min-width: 0;
			min-height: 360px;
			flex: 1 0 100%;
			align-self: stretch;
			background: transparent;
		}
		#gdl-bp-detail-root {
			order: -1 !important;
			display: block !important;
			width: 100%;
		}
		#gdl-bp-detail-root * { box-sizing: border-box; }
		#gdl-bp-detail-root a { color: inherit; text-decoration: none; }
		#gdl-bp-detail-root .gdl-bp-section { margin: 0 0 34px; }
		@keyframes gdl-bp-rare-pulse {
			0% { opacity: .20; transform: scale(.80); filter: blur(2px); }
			15% { opacity: .94; transform: scale(1.15); filter: blur(6.8px); }
			31% { opacity: .40; transform: scale(.90); filter: blur(3.2px); }
			49% { opacity: 1; transform: scale(1.27); filter: blur(9.4px); }
			66% { opacity: .48; transform: scale(.94); filter: blur(3.8px); }
			83% { opacity: 1; transform: scale(1.17); filter: blur(7.2px); }
			100% { opacity: .20; transform: scale(.80); filter: blur(2px); }
		}		@keyframes gdl-bp-rare-rays-a {
			0%, 100% { opacity: .18; filter: blur(3px); }
			23% { opacity: .62; filter: blur(2.2px); }
			48% { opacity: .28; filter: blur(3.3px); }
			74% { opacity: .52; filter: blur(2.4px); }
		}
		@keyframes gdl-bp-rare-rays-b {
			0%, 100% { opacity: .48; filter: blur(2.4px); }
			29% { opacity: .16; filter: blur(3.5px); }
			58% { opacity: .57; filter: blur(2px); }
			83% { opacity: .24; filter: blur(3.1px); }
		}
		@keyframes gdl-bp-rays-a {
			0%, 100% { opacity: .12; transform: scale(.96); filter: blur(3.6px); }
			28% { opacity: .44; transform: scale(1.015); filter: blur(2.8px); }
			57% { opacity: .22; transform: scale(.985); filter: blur(3.5px); }
			78% { opacity: .38; transform: scale(1.025); filter: blur(3px); }
		}
		@keyframes gdl-bp-rays-b {
			0%, 100% { opacity: .30; transform: scale(1.015); filter: blur(3px); }
			24% { opacity: .13; transform: scale(.975); filter: blur(3.9px); }
			52% { opacity: .40; transform: scale(1.025); filter: blur(2.7px); }
			82% { opacity: .16; transform: scale(.985); filter: blur(3.7px); }
		}
		#gdl-bp-detail-root .gdl-bp-section-title {
			margin: 0 0 14px;
			font-size: 22px;
			line-height: 28px;
			font-weight: 700;
			color: #f3f4f5;
		}
		#gdl-bp-detail-root .gdl-bp-feed-group {
			margin-bottom: 24px;
		}
		#gdl-bp-detail-root .gdl-bp-date-heading {
			font-size: 13.5px;
			font-weight: 700;
			color: #8f98a0;
			text-transform: uppercase;
			letter-spacing: 0.8px;
			margin: 20px 0 10px;
			padding-left: 2px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-list {
			display: flex;
			flex-direction: column;
			gap: 10px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-card {
			display: flex;
			align-items: stretch;
			gap: 22px;
			background: rgba(0, 0, 0, 0.35);
			border: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 4px;
			padding: 16px 20px;
			text-decoration: none;
			color: inherit;
			cursor: pointer;
			box-sizing: border-box;
			position: relative;
			transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-feed-card:hover,
		#gdl-bp-detail-root .gdl-bp-feed-card:focus,
		#gdl-bp-detail-root .gdl-bp-feed-card:focus-visible,
		#gdl-bp-detail-root .gdl-bp-feed-card.gpfocus,
		#gdl-bp-detail-root .gdl-bp-feed-card.focus,
		#gdl-bp-detail-root .gdl-bp-feed-card[data-focus="true"] {
			background: rgba(255, 255, 255, 0.12) !important;
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 6px 22px rgba(0, 0, 0, 0.6) !important;
			transform: scale(1.015) !important;
			outline: none !important;
			z-index: 2;
		}
		#gdl-bp-detail-root .gdl-bp-feed-icon-wrap {
			flex: 0 0 54px;
			width: 54px;
			height: 54px;
			display: flex;
			align-items: center;
			justify-content: center;
			color: #8f98a0;
			align-self: center;
		}
		#gdl-bp-detail-root .gdl-bp-feed-avatar {
			width: 48px;
			height: 48px;
			border-radius: 4px;
			object-fit: cover;
			flex-shrink: 0;
			background: #191e25;
			align-self: flex-start;
		}
		#gdl-bp-detail-root .gdl-bp-feed-thumb {
			width: 220px;
			height: 124px;
			min-width: 220px;
			border-radius: 3px;
			object-fit: cover;
			flex-shrink: 0;
			background: #191e25;
			align-self: center;
		}
		#gdl-bp-detail-root .gdl-bp-feed-body {
			flex: 1 1 auto;
			min-width: 0;
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 4px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-eyebrow {
			font-size: 11.5px;
			font-weight: 700;
			line-height: 1.2;
			color: #8f98a0;
			text-transform: uppercase;
			letter-spacing: 0.6px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-title {
			font-size: 17.5px;
			font-weight: 500;
			line-height: 1.3;
			color: #ffffff;
		}
		#gdl-bp-detail-root .gdl-bp-feed-desc {
			font-size: 14px;
			line-height: 1.45;
			color: #8f98a0;
			margin-top: 4px;
			display: -webkit-box;
			-webkit-line-clamp: 3;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
		#gdl-bp-detail-root .gdl-bp-feed-meta {
			align-self: flex-end;
			margin-left: auto;
			display: flex;
			align-items: center;
			gap: 14px;
			color: #8f98a0;
			font-size: 13px;
		}
		#gdl-bp-detail-root .gdl-bp-summary-box {
			background: rgba(59,64,73,.82);
			padding: 22px 16px;
			overflow: hidden;
		}
		#gdl-bp-detail-root .gdl-bp-summary-date {
			font-size: 17px;
			color: #d0d3d7;
			margin: 0 0 18px;
		}
		#gdl-bp-detail-root .gdl-bp-summary-grid {
			display: grid;
			grid-template-columns: repeat(4, minmax(210px, 1fr));
			gap: 28px;
		}
		#gdl-bp-detail-root .gdl-bp-summary-ach {
			display: grid;
			grid-template-columns: 78px minmax(0,1fr);
			gap: 12px;
			align-items: center;
			min-width: 0;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame {
			position: relative;
			width: 78px;
			height: 78px;
			flex: 0 0 78px;
			display:flex;
			align-items:center;
			justify-content:center;
			background: linear-gradient(180deg, #0f1720 0%, #101820 100%);
			border: 1px solid rgba(0,0,0,.42);
			box-sizing: border-box;
			isolation: isolate;
			overflow: visible;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare {
			border-color: rgba(0,0,0,.42);
			box-shadow: none;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img {
			position: relative;
			z-index: 3;
			width: 100%;
			height: 100%;
			object-fit: cover;
			background: #11161d;
			box-shadow: 0 3px 8px rgba(0,0,0,.5);
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-img {
			width: 100%;
			height: 100%;
		}
		#gdl-bp-detail-root .gdl-bp-summary-ach strong { display:block;font-size:17px;line-height:21px;color:#eee;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
		#gdl-bp-detail-root .gdl-bp-summary-ach span { display:block;font-size:14px;line-height:18px;color:#a3a9b0; }
		#gdl-bp-detail-root .gdl-bp-achievements-shell { background: rgba(31,36,44,.82); }
		#gdl-bp-detail-root .gdl-bp-ach-progress {
			position: relative;
			display: grid;
			grid-template-columns: auto minmax(0,1fr);
			gap: 16px;
			align-items: center;
			min-height: 62px;
			padding: 8px 18px 8px 6px;
			background: rgba(24,30,38,.88);
		}
		#gdl-bp-detail-root .gdl-bp-medal { width: 48px;height: 54px;display:flex;align-items:center;justify-content:center;color:#1a9fff; }
		#gdl-bp-detail-root .gdl-bp-ach-progress-copy { min-width:0; }
		#gdl-bp-detail-root .gdl-bp-ach-progress-label { font-size:20px;line-height:26px;color:#dcdfe3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
		#gdl-bp-detail-root .gdl-bp-ach-progress-label strong { color:#fff; }
		#gdl-bp-detail-root .gdl-bp-progress-track { height:10px;border-radius:2px;background:#3d444c;margin-top:8px;overflow:hidden; }
		#gdl-bp-detail-root .gdl-bp-progress-fill { height:100%;background:#1a9fff; }
		#gdl-bp-detail-root .gdl-bp-ach-strip { display:grid;grid-template-columns:minmax(390px,1.15fr) minmax(0,1fr);gap:12px;padding:24px 14px 14px;align-items:center; }
		#gdl-bp-detail-root .gdl-bp-ach-featured { display:grid;grid-template-columns:88px minmax(0,1fr);gap:14px;padding:10px;background:rgba(75,83,95,.76);min-height:110px;align-items:center; }
		#gdl-bp-detail-root .gdl-bp-ach-featured .gdl-bp-ach-img { width:88px;height:88px; }
		#gdl-bp-detail-root .gdl-bp-ach-featured strong { font-size:18px;line-height:22px; }
		#gdl-bp-detail-root .gdl-bp-ach-featured p { margin:3px 0;font-size:15px;color:#aeb3ba;line-height:20px; }
		#gdl-bp-detail-root .gdl-bp-ach-icons { display:flex;gap:8px;align-items:center;overflow:hidden; }
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame {
			position: relative;
			width:82px;
			height:82px;
			flex:0 0 82px;
			display:flex;
			align-items:center;
			justify-content:center;
			background: linear-gradient(180deg, #0f1720 0%, #101820 100%);
			border: 1px solid rgba(0,0,0,.46);
			box-sizing:border-box;
			isolation:isolate;
			overflow:visible;
		}
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare {
			border-color: rgba(0,0,0,.46);
			box-shadow:none;
		}
		#gdl-bp-detail-root .gdl-bp-ach-icon {
			position: relative;
			z-index: 3;
			width:100%;
			height:100%;
			object-fit:cover;
			background:#11161d;
		}
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-icon {
			width:100%;
			height:100%;
		}
		#gdl-bp-detail-root .gdl-bp-ach-icon.is-locked { filter: grayscale(1) brightness(.42); opacity:1; }
		#gdl-bp-detail-root .gdl-bp-ach-rare-glow,
		#gdl-bp-detail-root .gdl-bp-ach-rare-ring,
		#gdl-bp-detail-root .gdl-bp-ach-rare-beam {
			display:none;
			pointer-events:none;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-rare-glow,
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-rare-glow {
			display:block;
			position:absolute;
			inset:-8px;
			z-index:0;
			border-radius:10px;
			background:radial-gradient(ellipse at center,
				rgba(255,235,116,.70) 0%,
				rgba(255,183,46,.58) 38%,
				rgba(255,145,20,.34) 58%,
				transparent 76%);
			filter:blur(6.8px);
			opacity:1;
			transform-origin:50% 50%;
			will-change:transform,opacity,filter;
			animation: gdl-bp-rare-pulse 15s cubic-bezier(.42,0,.32,1) infinite;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-rare-ring,
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-rare-beam,
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-rare-ring,
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-rare-beam {
			display:none !important;
		}
		#gdl-bp-detail-root .gdl-bp-ach-img-frame.is-rare .gdl-bp-ach-img,
		#gdl-bp-detail-root .gdl-bp-ach-icon-frame.is-rare .gdl-bp-ach-icon {
			filter:drop-shadow(0 0 2px rgba(255,224,86,.92))
				drop-shadow(0 0 9px rgba(255,174,36,.72));
		}
		#gdl-bp-detail-root .gdl-bp-cards-shell { background: rgba(57,62,71,.82); }
		#gdl-bp-detail-root .gdl-bp-badge-row { min-height:86px;background:rgba(31,36,44,.88);display:flex;align-items:center;gap:16px;padding:10px 16px; }
		#gdl-bp-detail-root .gdl-bp-badge-img { width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px dashed rgba(255,255,255,.3); }
		#gdl-bp-detail-root .gdl-bp-badge-copy { font-size:17px;line-height:24px;color:#c9ccd1; }
		#gdl-bp-detail-root .gdl-bp-media-box,
		#gdl-bp-detail-root .gdl-bp-notes-box { background:rgba(57,62,71,.82);padding:28px 16px;min-height:110px; }
		#gdl-bp-detail-root .gdl-bp-media-box { display:flex;align-items:center;justify-content:center;position:relative; }
		#gdl-bp-detail-root .gdl-bp-media-copy { font-size:18px;color:#a6abb2;text-align:center; }
		#gdl-bp-detail-root .gdl-bp-action-button,
		#gdl-bp-detail-root .gdl-bp-info-link {
			display:inline-flex;
			align-items:center;
			justify-content:center;
			min-height:52px;
			padding:0 28px;
			background:#454d5a;
			color:#f1f2f3;
			font-size:18px;
			font-weight:500;
			border:0;
			border-radius:2px;
			cursor:pointer;
		}
		#gdl-bp-detail-root .gdl-bp-action-button:hover,
		#gdl-bp-detail-root .gdl-bp-info-link:hover,
		#gdl-bp-detail-root .gdl-bp-action-button:focus,
		#gdl-bp-detail-root .gdl-bp-action-button:focus-visible,
		#gdl-bp-detail-root .gdl-bp-action-button.gpfocus,
		#gdl-bp-detail-root .gdl-bp-action-button.focus,
		#gdl-bp-detail-root .gdl-bp-info-link:focus,
		#gdl-bp-detail-root .gdl-bp-info-link:focus-visible,
		#gdl-bp-detail-root .gdl-bp-info-link.gpfocus,
		#gdl-bp-detail-root .gdl-bp-info-link.focus {
			background: #ffffff !important;
			color: #12161c !important;
			box-shadow: 0 0 0 2px #ffffff, 0 6px 20px rgba(0, 0, 0, 0.5) !important;
			transform: scale(1.04) !important;
			outline: none !important;
		}
		#gdl-bp-detail-root .gdl-bp-media-box .gdl-bp-action-button { position:absolute;left:14px;bottom:14px; }
		#gdl-bp-detail-root .gdl-bp-info-grid { display:grid;grid-template-columns:220px minmax(0,1fr) 300px;gap:24px;align-items:start;margin-top:14px; }
		#gdl-bp-detail-root .gdl-bp-info-portrait { width:220px;height:330px;object-fit:cover;background:#171b21;border-radius:4px;box-shadow:0 8px 24px rgba(0,0,0,0.5); }
		#gdl-bp-detail-root .gdl-bp-info-description { font-size:16.5px;line-height:27px;color:#e4e5e7;min-height:100px; }
		#gdl-bp-detail-root .gdl-bp-info-meta { margin-top:28px;font-size:14.5px;line-height:24px;color:#939aa3; }
		#gdl-bp-detail-root .gdl-bp-info-meta strong { color:#e2e4e6;font-weight:500; }
		#gdl-bp-detail-root .gdl-bp-feature { display:flex;align-items:center;gap:12px;min-height:35px;color:#a6abb2;font-size:16px; }
		#gdl-bp-detail-root .gdl-bp-feature svg { width:26px;height:26px;color:#9da2a8;flex:0 0 26px; }
		#gdl-bp-detail-root .gdl-bp-info-links { display:flex;flex-wrap:wrap;gap:10px;margin-top:28px; }
		#gdl-bp-detail-root .gdl-bp-loading { min-height:310px;display:flex;align-items:center;justify-content:center;color:#9da4ab;font-size:18px; }
		#gdl-bp-detail-root .gdl-bp-empty { padding:28px;background:rgba(49,55,64,.68);font-size:17px;color:#aeb3ba; }
		/* Cloud status banner (matches Steam Big Picture native divider in Image 3) */
		.gdl-bp-cloud-divider {
			display: flex !important;
			align-items: center !important;
			justify-content: center !important;
			position: relative !important;
			margin: 14px 0 18px !important;
			width: 100% !important;
			max-width: 100% !important;
			flex: 1 0 100% !important;
			flex-basis: 100% !important;
			order: -100 !important;
			box-sizing: border-box !important;
			gap: 16px !important;
		}
		.gdl-bp-cloud-divider::before,
		.gdl-bp-cloud-divider::after {
			content: '' !important;
			flex: 1 1 auto !important;
			height: 1px !important;
			background: rgba(255, 255, 255, 0.12) !important;
		}
		.gdl-bp-cloud-badge {
			display: inline-flex !important;
			align-items: center !important;
			gap: 10px !important;
			background: transparent !important;
			border-radius: 0 !important;
			padding: 0 !important;
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
			font-size: 13.5px !important;
			font-weight: 700 !important;
			letter-spacing: 0.8px !important;
			color: #b8bcbf !important;
			text-transform: uppercase !important;
			white-space: nowrap !important;
			flex: 0 0 auto !important;
		}
		.gdl-bp-cloud-badge svg {
			width: 18px !important;
			height: 18px !important;
			color: #b8bcbf !important;
			display: block !important;
		}

		/* PlayBar stats (matches Steam Big Picture native typography in Image 1) */
		.gdl-bp-playbar-stat {
			display: flex !important;
			flex-direction: column !important;
			gap: 3px !important;
			margin-left: 26px !important;
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
		}
		.gdl-bp-stat-label {
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
			font-size: 12px !important;
			font-weight: 700 !important;
			letter-spacing: 0.8px !important;
			color: #8f98a0 !important;
			text-transform: uppercase !important;
			line-height: 1 !important;
		}
		.gdl-bp-stat-value {
			font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
			font-size: 20px !important;
			font-weight: 800 !important;
			color: #ffffff !important;
			display: flex !important;
			align-items: center !important;
			gap: 10px !important;
			line-height: 1.2 !important;
		}
		.gdl-bp-ctrl-icons {
			display: flex !important;
			align-items: center !important;
			height: 24px !important;
		}
		.gdl-bp-ctrl-img {
			height: 20px !important;
			width: auto !important;
			object-fit: contain !important;
			display: block !important;
			filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4)) !important;
		}
		.gdl-bp-ach-value {
			display: flex !important;
			align-items: center !important;
			gap: 12px !important;
		}
		.gdl-bp-stat-progress-track {
			width: 72px !important;
			height: 5px !important;
			background: rgba(255, 255, 255, 0.16) !important;
			border-radius: 3px !important;
			overflow: hidden !important;
		}
		.gdl-bp-stat-progress-fill {
			height: 100% !important;
			background: #2d73ff !important;
			border-radius: 3px !important;
		}

		/* Friends Section */
		#gdl-bp-detail-root .gdl-bp-friends-section {
			margin-bottom: 24px;
		}
		#gdl-bp-detail-root .gdl-bp-friends-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 16px;
		}
		#gdl-bp-detail-root .gdl-bp-friends-col {
			background: rgba(255, 255, 255, 0.04);
			border: 1px solid rgba(255, 255, 255, 0.04);
			border-radius: 4px;
			padding: 12px 16px;
			min-height: 56px;
		}
		#gdl-bp-detail-root .gdl-bp-friends-col-header {
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: #8f98a0;
			text-transform: uppercase;
			margin-bottom: 8px;
		}
		#gdl-bp-detail-root .gdl-bp-friends-avatar-row {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
		}
		#gdl-bp-detail-root .gdl-bp-friend-card {
			width: 38px;
			height: 38px;
			border-radius: 3px;
			overflow: hidden;
			background: #191e25;
			cursor: pointer;
			border: 1px solid transparent;
			transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-friend-card:hover,
		#gdl-bp-detail-root .gdl-bp-friend-card:focus,
		#gdl-bp-detail-root .gdl-bp-friend-card.gpfocus,
		#gdl-bp-detail-root .gdl-bp-friend-card[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 4px 14px rgba(0, 0, 0, 0.6) !important;
			transform: scale(1.08) !important;
			outline: none !important;
			z-index: 3;
		}
		#gdl-bp-detail-root .gdl-bp-friend-avatar {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}
		#gdl-bp-detail-root .gdl-bp-friends-empty {
			color: #616871;
			font-size: 14px;
		}

		/* Trading Cards in Big Picture */
		#gdl-bp-detail-root .gdl-bp-card-row {
			display: flex;
			flex-wrap: wrap;
			gap: 14px;
			align-items: flex-start;
			margin-top: 14px;
		}
		#gdl-bp-detail-root .gdl-bp-card-count {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: #8f98a0;
			text-transform: uppercase;
			margin: 18px 0 8px;
		}
		#gdl-bp-detail-root .gdl-bp-card-row-locked .gdl-bp-card-item img {
			filter: grayscale(1) brightness(0.35) opacity(0.5) !important;
		}
		#gdl-bp-detail-root .gdl-bp-card-item {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: center;
			cursor: pointer;
			border-radius: 4px;
			padding: 4px;
			border: 2px solid transparent;
			transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
			outline: none;
			background: transparent;
		}
		#gdl-bp-detail-root .gdl-bp-card-item img {
			width: 110px;
			height: auto;
			display: block;
			border-radius: 2px;
			box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
			opacity: 1 !important;
		}
		#gdl-bp-detail-root .gdl-bp-card-item:hover,
		#gdl-bp-detail-root .gdl-bp-card-item:focus,
		#gdl-bp-detail-root .gdl-bp-card-item.gpfocus,
		#gdl-bp-detail-root .gdl-bp-card-item[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 8px 24px rgba(0, 0, 0, 0.7) !important;
			transform: scale(1.08) !important;
			z-index: 5;
		}

		/* Activity Feed Native Layout */
		#gdl-bp-detail-root .gdl-bp-feed-post-section {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 20px;
			margin-bottom: 24px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-input-wrap {
			flex: 1;
			max-width: 650px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-input {
			width: 100%;
			height: 48px;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: 4px;
			color: #ffffff;
			font-size: 15px;
			padding: 0 16px;
			box-sizing: border-box;
			outline: none;
			transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-input::placeholder {
			color: #8f98a0;
		}
		#gdl-bp-detail-root .gdl-bp-feed-post-input:focus,
		#gdl-bp-detail-root .gdl-bp-feed-post-input.gpfocus {
			background: rgba(255, 255, 255, 0.14);
			border-color: #ffffff;
			box-shadow: 0 0 0 2px #ffffff, 0 4px 16px rgba(0, 0, 0, 0.5);
		}
		#gdl-bp-detail-root .gdl-bp-feed-jump-news {
			background: transparent;
			border: none;
			color: #8f98a0;
			font-size: 13.5px;
			font-weight: 600;
			cursor: pointer;
			padding: 8px 12px;
			border-radius: 4px;
			outline: none;
			transition: color 0.15s ease, background 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-feed-jump-news:hover,
		#gdl-bp-detail-root .gdl-bp-feed-jump-news:focus,
		#gdl-bp-detail-root .gdl-bp-feed-jump-news.gpfocus {
			color: #ffffff;
			background: rgba(255, 255, 255, 0.1);
			box-shadow: 0 0 0 2px #ffffff;
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
			color: #8f98a0;
			text-transform: uppercase;
			margin: 0;
		}
		#gdl-bp-detail-root .gdl-bp-feed-thumb-wrap {
			width: 320px;
			min-width: 320px;
			height: 180px;
			border-radius: 4px;
			overflow: hidden;
			background: #15191f;
			flex-shrink: 0;
		}
		#gdl-bp-detail-root .gdl-bp-feed-thumb {
			width: 100%;
			height: 100%;
			object-fit: cover;
			display: block;
		}
		#gdl-bp-detail-root .gdl-bp-feed-card {
			background: rgba(25, 30, 38, 0.7);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 6px;
			padding: 16px;
			margin-bottom: 14px;
			display: flex;
			gap: 20px;
			align-items: stretch;
			text-decoration: none;
			color: inherit;
			transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
			outline: none;
		}
		#gdl-bp-detail-root .gdl-bp-feed-card:hover,
		#gdl-bp-detail-root .gdl-bp-feed-card:focus,
		#gdl-bp-detail-root .gdl-bp-feed-card.gpfocus,
		#gdl-bp-detail-root .gdl-bp-feed-card[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 8px 24px rgba(0, 0, 0, 0.7) !important;
			transform: scale(1.015) !important;
			z-index: 2;
		}
		#gdl-bp-detail-root .gdl-bp-feed-eyebrow {
			font-size: 12px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: #8f98a0;
			text-transform: uppercase;
		}
		#gdl-bp-detail-root .gdl-bp-feed-title {
			font-size: 22px;
			font-weight: 700;
			color: #ffffff;
			line-height: 1.25;
		}
		#gdl-bp-detail-root .gdl-bp-feed-desc {
			font-size: 14px;
			color: #b8bcbf;
			line-height: 1.45;
			margin-top: 4px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-load-more-wrap {
			display: flex;
			justify-content: center;
			padding: 24px 0 40px;
		}
		#gdl-bp-detail-root .gdl-bp-feed-load-more-btn {
			background: rgba(255, 255, 255, 0.1);
			color: #ffffff;
			font-size: 14.5px;
			font-weight: 600;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 4px;
			padding: 10px 32px;
			cursor: pointer;
			outline: none;
			transition: background 0.15s ease, border-color 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-feed-load-more-btn:hover,
		#gdl-bp-detail-root .gdl-bp-feed-load-more-btn:focus,
		#gdl-bp-detail-root .gdl-bp-feed-load-more-btn.gpfocus {
			background: rgba(255, 255, 255, 0.18);
			border-color: #ffffff;
			box-shadow: 0 0 0 2px #ffffff;
		}

		/* Community Videos & Guides */
		#gdl-bp-detail-root .gdl-bp-community-videos-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 20px;
			margin-bottom: 28px;
		}
		#gdl-bp-detail-root .gdl-bp-community-video-card {
			background: rgba(25, 30, 38, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 6px;
			overflow: hidden;
			padding: 12px;
			cursor: pointer;
			outline: none;
			transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-community-video-card:hover,
		#gdl-bp-detail-root .gdl-bp-community-video-card:focus,
		#gdl-bp-detail-root .gdl-bp-community-video-card.gpfocus,
		#gdl-bp-detail-root .gdl-bp-community-video-card[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 8px 24px rgba(0, 0, 0, 0.7) !important;
			transform: scale(1.02) !important;
		}
		#gdl-bp-detail-root .gdl-bp-community-media-wrap {
			position: relative;
			aspect-ratio: 16 / 9;
			border-radius: 4px;
			overflow: hidden;
			background: #10141a;
		}
		#gdl-bp-detail-root .gdl-bp-inline-video {
			width: 100%;
			height: 100%;
			border: 0;
			display: block;
		}
		#gdl-bp-detail-root .gdl-bp-community-guides-grid {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 16px;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-card {
			background: rgba(25, 30, 38, 0.75);
			border: 1px solid rgba(255, 255, 255, 0.06);
			border-radius: 6px;
			padding: 14px;
			display: flex;
			flex-direction: column;
			gap: 10px;
			cursor: pointer;
			outline: none;
			transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-card:hover,
		#gdl-bp-detail-root .gdl-bp-community-guide-card:focus,
		#gdl-bp-detail-root .gdl-bp-community-guide-card.gpfocus,
		#gdl-bp-detail-root .gdl-bp-community-guide-card[data-focus="true"] {
			border-color: #ffffff !important;
			box-shadow: 0 0 0 2px #ffffff, 0 8px 24px rgba(0, 0, 0, 0.7) !important;
			transform: scale(1.02) !important;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-eyebrow {
			font-size: 11px;
			font-weight: 700;
			letter-spacing: 0.8px;
			color: #8f98a0;
			text-transform: uppercase;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-content {
			display: flex;
			gap: 12px;
			align-items: flex-start;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-thumb {
			width: 64px;
			height: 64px;
			object-fit: cover;
			border-radius: 4px;
			background: #11161d;
			flex-shrink: 0;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-title {
			font-size: 14px;
			font-weight: 600;
			color: #ffffff;
			line-height: 1.35;
		}
		#gdl-bp-detail-root .gdl-bp-community-guide-desc {
			font-size: 12.5px;
			color: #8f98a0;
			line-height: 1.45;
			display: -webkit-box;
			-webkit-line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}


		/* Conceal Steam's native non-steam explanation and collections inside Big Picture */
		[data-gdl-bp-native-panel="1"] > *:not(#gdl-bp-detail-root),
		[class*="ShortcutDetails"] [class*="EmptyDetails"],
		[class*="ShortcutDetails"] [class*="NonSteamNotice"],
		[class*="ShortcutDetails"] [class*="CollectionsSection"],
		[class*="AppDetails"] [class*="NonSteamExplanation"],
		[class*="AppDetails"] [class*="NonSteamNotice"],
		[class*="NonSteamDisclaimer"],
		[class*="GameDetails"] [class*="CollectionsSection"],
		[class*="AppDetails"] [class*="CollectionsSection"] {
			display: none !important;
		}
		@media (max-width: 1320px) {
			#gdl-bp-detail-root { width: calc(100% - 36px); }
			#gdl-bp-detail-root .gdl-bp-community-videos-grid { grid-template-columns: 1fr; }
			#gdl-bp-detail-root .gdl-bp-community-guides-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
			#gdl-bp-detail-root .gdl-bp-summary-grid { grid-template-columns:repeat(2,minmax(220px,1fr)); }
			#gdl-bp-detail-root .gdl-bp-info-grid { grid-template-columns:190px minmax(0,1fr) 260px; }
			#gdl-bp-detail-root .gdl-bp-info-portrait { width:190px;height:282px; }
			#gdl-bp-detail-root .gdl-bp-friends-grid { grid-template-columns: 1fr; }
		}
	`;
	(doc.head || doc.documentElement).appendChild(style);
}
