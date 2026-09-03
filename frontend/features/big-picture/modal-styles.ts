export function ensureBigPictureModalStyles(doc: Document): void {
	const id = 'gdl-bp-modals-style';
	if (doc.getElementById(id)) return;
	const style = doc.createElement('style');
	style.id = id;
	style.textContent = `
		@keyframes gdl-bp-fadein {
			from { opacity: 0; }
			to { opacity: 1; }
		}
		.gdl-bp-fadein {
			animation: gdl-bp-fadein 0.15s ease-out;
		}

		/* Gamepad focus and hover highlights for Big Picture React Modals */
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

		.gdl-bp-ach-tab-btn:hover,
		.gdl-bp-ach-tab-btn:focus,
		.gdl-bp-ach-tab-btn.gpfocus {
			color: #ffffff !important;
			outline: 2px solid #ffffff !important;
		}

		.gdl-bp-ach-search-input:focus,
		.gdl-bp-ach-search-input.gpfocus {
			border-color: #ffffff !important;
			outline: 2px solid #ffffff !important;
		}

		.gdl-bp-ach-compare-btn:hover,
		.gdl-bp-ach-compare-btn:focus,
		.gdl-bp-ach-compare-btn.gpfocus {
			color: #ffffff !important;
			border-color: #ffffff !important;
			outline: 2px solid #ffffff !important;
		}

		.gdl-bp-news-modal-action-btn:hover,
		.gdl-bp-news-modal-action-btn:focus,
		.gdl-bp-news-modal-action-btn.gpfocus {
			background: #4c5565 !important;
			border-color: #ffffff !important;
			outline: 2px solid #ffffff !important;
		}

		.gdl-bp-news-modal-close:hover,
		.gdl-bp-news-modal-close:focus,
		.gdl-bp-news-modal-close.gpfocus {
			background: rgba(255, 255, 255, 0.25) !important;
			outline: 2px solid #ffffff !important;
			transform: scale(1.08);
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
	`;
	doc.head?.appendChild(style);
}
