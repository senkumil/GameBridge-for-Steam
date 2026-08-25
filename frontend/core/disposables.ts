export type Disposer = () => void;

/**
 * Owns timers, observers and event listeners for one runtime scope.
 * Every registration is paired with an idempotent cleanup so Steam window
 * recreation cannot leave detached documents or callbacks alive.
 */
export class DisposableRegistry {
	private readonly disposers = new Set<Disposer>();
	private disposed = false;

	constructor(private readonly onDisposed?: () => void) {}

	add(disposer: Disposer): Disposer {
		if (this.disposed) {
			try { disposer(); } catch {}
			return () => {};
		}
		let active = true;
		const wrapped = () => {
			if (!active) return;
			active = false;
			this.disposers.delete(wrapped);
			try { disposer(); } catch {}
		};
		this.disposers.add(wrapped);
		return wrapped;
	}

	listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions): Disposer;
	listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void, options?: boolean | AddEventListenerOptions): Disposer;
	listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposer;
	listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): Disposer {
		target.addEventListener(type, listener, options);
		return this.add(() => target.removeEventListener(type, listener, options));
	}

	timeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
		let cleanup: Disposer = () => {};
		const handle = setTimeout(() => {
			cleanup();
			if (!this.disposed) callback();
		}, delayMs);
		cleanup = this.add(() => clearTimeout(handle));
		return handle;
	}

	interval(callback: () => void, delayMs: number): ReturnType<typeof setInterval> {
		const handle = setInterval(() => {
			if (!this.disposed) callback();
		}, delayMs);
		this.add(() => clearInterval(handle));
		return handle;
	}

	observe(observer: MutationObserver | ResizeObserver, target: Node | Element, options?: MutationObserverInit): Disposer {
		if (observer instanceof MutationObserver) observer.observe(target as Node, options || {});
		else observer.observe(target as Element);
		return this.add(() => observer.disconnect());
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		for (const dispose of Array.from(this.disposers).reverse()) dispose();
		this.disposers.clear();
		try { this.onDisposed?.(); } catch {}
	}

	get isDisposed(): boolean {
		return this.disposed;
	}
}
