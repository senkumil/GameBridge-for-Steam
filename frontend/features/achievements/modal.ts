import type { LocalAchievementData, LocalAchievementItem } from '../../domain/types';
import { escapeHtml } from '../../core/text';
import { gdlText } from '../../steam/localization';
import { formatLocalUnlockDate, localAchievementPercent } from './format';
import { getLocalAchievementGameInfo } from './game-info';

export async function openLocalAchievementsModal(doc: Document, data: LocalAchievementData): Promise<void> {
	doc.getElementById('gdl-local-achievement-modal')?.remove();
	const info = await getLocalAchievementGameInfo(data.appid);
	if (!doc.body) return;
	const pct = localAchievementPercent(data);
	const overlay = doc.createElement('div');
	overlay.id = 'gdl-local-achievement-modal';
	overlay.innerHTML = `
		<div class="gdl-lam-window" role="dialog" aria-modal="true">
			<div class="gdl-lam-head">
				<button class="gdl-lam-close" aria-label="${escapeHtml(gdlText('close', 'Close'))}">×</button>
				<div class="gdl-lam-title">
					${info.headerImage ? `<img class="gdl-lam-game-icon" src="${escapeHtml(info.headerImage)}">` : ''}
					<span>${escapeHtml(info.name)}</span>
				</div>
				<div class="gdl-lam-progressbox">
					<div class="gdl-lam-progressline">
						<span>${escapeHtml(gdlText('achievements_unlocked', '{unlocked} of {total} achievements unlocked', { unlocked: data.unlocked, total: data.total }))}</span>
						<span>(${pct}%)</span>
					</div>
					<div class="gdl-lam-track"><div class="gdl-lam-fill" style="width:${pct}%"></div></div>
				</div>
				<div class="gdl-lam-tabs">
					<button class="gdl-lam-tab active" data-tab="mine">${escapeHtml(gdlText('achievements_mine', 'MY ACHIEVEMENTS'))}</button>
					<button class="gdl-lam-tab" data-tab="global">${escapeHtml(gdlText('achievements_global', 'GLOBAL ACHIEVEMENTS'))}</button>
				</div>
			</div>
			<div class="gdl-lam-toolbar"><input class="gdl-lam-search" placeholder="${escapeHtml(gdlText('search', 'Search'))}"></div>
			<div class="gdl-lam-list"></div>
		</div>`;
	doc.body.appendChild(overlay);

	const list = overlay.querySelector('.gdl-lam-list') as HTMLElement;
	const search = overlay.querySelector('.gdl-lam-search') as HTMLInputElement;
	let tab: 'mine' | 'global' = 'mine';
	const rowHtml = (item: LocalAchievementItem, globalMode: boolean): string => {
		const locked = !item.earned;
		const icon = item.icon || item.icon_gray;
		const progress = !item.earned && item.max_progress > 0 ? Math.max(0, Math.min(100, Math.round((item.progress / item.max_progress) * 100))) : 0;
		const right = item.earned
			? `<div>${escapeHtml(gdlText('unlocked_on', 'Unlocked on {date}', { date: formatLocalUnlockDate(item.earned_time) }))}</div>`
			: (progress > 0
				? `<div style="margin-bottom:4px;font-size:12px;color:#8f98a0;">${item.progress}/${item.max_progress}</div><div style="width:140px;height:5px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;"><div style="width:${progress}%;height:100%;background:#1a9fff;"></div></div>`
				: '');
		return `<div class="gdl-lam-row" data-search="${escapeHtml((item.display_name + ' ' + item.description).toLocaleLowerCase())}">
			${icon ? `<img class="gdl-lam-row-icon${locked ? ' locked' : ''}" src="${escapeHtml(locked ? (item.icon_gray || item.icon) : item.icon)}" loading="lazy">` : `<div class="gdl-lam-row-icon ${locked ? 'locked' : ''}" style="display:flex;align-items:center;justify-content:center;font-size:25px">★</div>`}
			<div class="gdl-lam-row-main"><div class="gdl-lam-row-title">${escapeHtml(item.display_name || item.name)}</div><div class="gdl-lam-row-desc">${escapeHtml(item.description || (item.hidden && locked ? gdlText('hidden_achievement', 'Hidden achievement') : ''))}</div><div class="gdl-lam-row-global">${(item.global_percent || 0).toFixed(1)}% ${escapeHtml(gdlText('players_have_achievement', 'of players have this achievement'))}</div></div>
			<div class="gdl-lam-row-right">${globalMode ? `<span style="font-size:14px;font-weight:700;color:${item.earned ? '#ffffff' : '#8f98a0'};">${(item.global_percent || 0).toFixed(1)} %</span>` : right}</div>
		</div>`;
	};
	const render = () => {
		const query = (search.value || '').trim().toLocaleLowerCase();
		let rows = data.achievements.slice();
		if (tab === 'mine') rows.sort((a, b) => Number(b.earned) - Number(a.earned) || (b.earned_time || 0) - (a.earned_time || 0) || a.name.localeCompare(b.name));
		else rows.sort((a, b) => (b.global_percent || 0) - (a.global_percent || 0));
		if (query) rows = rows.filter(item => `${item.display_name} ${item.description} ${item.name}`.toLocaleLowerCase().includes(query));
		list.innerHTML = rows.length ? rows.map(item => rowHtml(item, tab === 'global')).join('') : `<div class="gdl-lam-empty">${escapeHtml(gdlText('no_achievements', 'No achievements found.'))}</div>`;
	};
	const close = () => overlay.remove();
	overlay.querySelector('.gdl-lam-close')?.addEventListener('click', close);
	overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
	overlay.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Escape') close(); });
	overlay.querySelectorAll('.gdl-lam-tab').forEach(button => button.addEventListener('click', () => {
		overlay.querySelectorAll('.gdl-lam-tab').forEach(item => item.classList.remove('active'));
		button.classList.add('active');
		tab = button.getAttribute('data-tab') === 'global' ? 'global' : 'mine';
		render();
	}));
	search.addEventListener('input', render);
	overlay.setAttribute('tabindex', '-1');
	overlay.focus();
	render();
}
