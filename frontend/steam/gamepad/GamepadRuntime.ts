import { backendLog } from '../../api/backend';
import { steamWebpackRuntime, type WebpackModuleEntry } from '../modules/SteamWebpackRuntime';
import { gamepadCapabilities } from './GamepadCapabilities';

class GamepadRuntime {
	private initialized = false;
	private activeDocument: Document | null = null;
	private reloadListenersBound = false;

	public initialize(doc?: Document): boolean {
		if (this.initialized && this.activeDocument === (doc || null)) {
			return true;
		}

		const targetDoc = doc || (typeof document !== 'undefined' ? document : undefined);
		this.activeDocument = targetDoc || null;

		backendLog('[NGL][Gamepad][Runtime] Probing Webpack Runtime for Gamepad UI...');
		const captured = steamWebpackRuntime.captureRuntime(targetDoc);

		if (captured) {
			this.initialized = true;
			gamepadCapabilities.setAvailable('appStore', Boolean((window as any)?.appStore || (window as any)?.AppStore));
			this.bindReloadDetection(targetDoc);
			backendLog('[NGL][Gamepad][Runtime] Gamepad Runtime captured and initialized successfully');
			return true;
		}

		backendLog('[NGL][Gamepad][Runtime] Gamepad Webpack Runtime not yet available, will retry on next interaction');
		return false;
	}

	public getModules(): WebpackModuleEntry[] {
		if (!this.initialized) this.initialize();
		return steamWebpackRuntime.getAllModules();
	}

	public getRequire(): any | null {
		if (!this.initialized) this.initialize();
		return steamWebpackRuntime.getRequire();
	}

	public isReady(): boolean {
		return this.initialized;
	}

	public invalidate(): void {
		this.initialized = false;
		this.activeDocument = null;
		gamepadCapabilities.resetCircuitBreakers();
		backendLog('[NGL][Gamepad][Runtime] Runtime invalidated and circuit breakers reset');
	}

	private bindReloadDetection(doc?: Document): void {
		if (this.reloadListenersBound || !doc) return;
		this.reloadListenersBound = true;

		doc.defaultView?.addEventListener('beforeunload', () => {
			backendLog('[NGL][Gamepad][Runtime] Steam Gamepad UI unloading, invalidating runtime state');
			this.invalidate();
		});
	}
}

export const gamepadRuntime = new GamepadRuntime();
