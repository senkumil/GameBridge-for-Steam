import { backendLog } from '../../api/backend';

export interface WebpackModuleEntry {
	id: string | number;
	exports: any;
}

class SteamWebpackRuntime {
	private requireFn: any = null;
	private moduleCache = new Map<string | number, any>();
	private inspected = false;

	public captureRuntime(doc?: Document): boolean {
		if (this.inspected && this.requireFn) return true;

		const targetWindows = this.collectTargetWindows(doc);
		for (const targetWin of targetWindows) {
			const chunkArray = targetWin.webpackChunksteamui || targetWin.webpackChunk || targetWin.webpackJsonp;
			if (!chunkArray || typeof chunkArray.push !== 'function') continue;

			try {
				const probeId = Symbol('ngl_webpack_runtime_probe');
				chunkArray.push([
					[probeId],
					{},
					(req: any) => {
						this.requireFn = req;
					},
				]);

				if (this.requireFn && typeof this.requireFn.c === 'object') {
					const cache = this.requireFn.c;
					const keys = Object.keys(cache);
					backendLog(`[NGL][Webpack] Runtime captured successfully, found ${keys.length} loaded modules in registry`);

					for (const key of keys) {
						const mod = cache[key]?.exports;
						if (mod) {
							this.moduleCache.set(key, mod);
						}
					}
					this.inspected = true;
					return true;
				}
			} catch (error) {
				backendLog(`[NGL][Webpack] Error during Webpack probe: ${error}`);
			}
		}

		return false;
	}

	public getAllModules(): WebpackModuleEntry[] {
		if (!this.inspected) this.captureRuntime();
		const result: WebpackModuleEntry[] = [];
		for (const [id, exports] of this.moduleCache) {
			result.push({ id, exports });
		}
		return result;
	}

	public getRequire(): any | null {
		if (!this.inspected) this.captureRuntime();
		return this.requireFn;
	}

	private collectTargetWindows(doc?: Document): any[] {
		const windows: any[] = [];
		if (doc?.defaultView) windows.push(doc.defaultView);
		if (typeof window !== 'undefined') windows.push(window);
		const pm = (window as any)?.g_PopupManager;
		if (pm) {
			try {
				for (const name of ['SP BPM_uid0', 'SP BPM', 'SP Desktop_uid0', 'SP Desktop']) {
					const popup = pm.GetExistingPopup?.(name) || pm.m_mapPopups?.get?.(name);
					const pWin = popup?.m_popup?.window || popup?.window || popup?.m_popup;
					if (pWin && !windows.includes(pWin)) windows.push(pWin);
				}
			} catch {}
		}
		return windows;
	}
}

export const steamWebpackRuntime = new SteamWebpackRuntime();
