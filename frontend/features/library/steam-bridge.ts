/** Wait for Steam's IPC bridge when a method returns a promise. */
export function waitForSteamBridge(result: unknown, timeoutMs: number): Promise<boolean> {
	if (result === false) return Promise.resolve(false);
	if (!result || typeof (result as any).then !== 'function') return Promise.resolve(true);
	return new Promise(resolve => {
		let settled = false;
		const finish = (ok: boolean): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(ok);
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		Promise.resolve(result).then(() => finish(true), () => finish(false));
	});
}
