import { backendLog } from '../../api/backend';

export interface GamepadCapabilities {
	runtime: boolean;
	appStore: boolean;
	libraryStore: boolean;
	navigation: boolean;
	userStore: boolean;

	hero: boolean;
	playbar: boolean;
	achievements: boolean;
	activity: boolean;
	news: boolean;
	gameInfo: boolean;
	friends: boolean;
	community: boolean;
	gameDetails: boolean;
}

export type GamepadCapabilityKey = keyof Omit<GamepadCapabilities, 'runtime'>;

class GamepadCapabilitiesManager {
	private capabilities: GamepadCapabilities = {
		runtime: false,
		appStore: false,
		libraryStore: false,
		navigation: false,
		userStore: false,
		hero: false,
		playbar: false,
		achievements: true,
		activity: false,
		news: false,
		gameInfo: false,
		friends: false,
		community: false,
		gameDetails: false,
	};

	private circuitBreakers = new Map<GamepadCapabilityKey, { failures: number; broken: boolean; lastError?: string }>();

	public isAvailable(key: GamepadCapabilityKey): boolean {
		const cb = this.circuitBreakers.get(key);
		if (cb && cb.broken) return false;
		return this.capabilities[key] ?? false;
	}

	public setAvailable(key: GamepadCapabilityKey, available: boolean): void {
		this.capabilities[key] = available;
		if (available) {
			this.circuitBreakers.delete(key);
			backendLog(`[NGL][Gamepad][Capabilities] Capability enabled: "${key}"`);
		}
	}

	public recordFailure(key: GamepadCapabilityKey, error: unknown): void {
		const entry = this.circuitBreakers.get(key) || { failures: 0, broken: false };
		entry.failures += 1;
		entry.lastError = String(error);
		if (entry.failures >= 3 && !entry.broken) {
			entry.broken = true;
			this.capabilities[key] = false;
			backendLog(`[NGL][Gamepad][CircuitBreaker] Tripped for capability "${key}" after 3 failures. Fallback engaged. Error: ${entry.lastError}`);
		}
		this.circuitBreakers.set(key, entry);
	}

	public getSnapshot(): GamepadCapabilities {
		return { ...this.capabilities };
	}

	public resetCircuitBreakers(): void {
		this.circuitBreakers.clear();
	}
}

export const gamepadCapabilities = new GamepadCapabilitiesManager();
