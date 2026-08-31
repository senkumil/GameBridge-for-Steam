/** Session-scoped navigation ownership for the desktop Library document. */
export class LibraryNavigationController {
	private readonly generations = new WeakMap<Document, number>();
	private readonly cleanupTimers = new Map<Document, ReturnType<typeof setTimeout>>();
	private readonly retryTimers = new Map<Document, ReturnType<typeof setTimeout>>();

	current(doc: Document): number { return this.generations.get(doc) || 0; }
	advance(doc: Document): number {
		const next = this.current(doc) + 1;
		this.generations.set(doc, next);
		this.cancelRetry(doc);
		return next;
	}
	isCurrent(doc: Document, generation: number): boolean { return this.current(doc) === generation; }
	scheduleRetry(doc: Document, generation: number, delayMs: number, task: () => void): void {
		this.cancelRetry(doc);
		const timer = setTimeout(() => {
			if (this.retryTimers.get(doc) === timer) this.retryTimers.delete(doc);
			if (this.isCurrent(doc, generation)) task();
		}, delayMs);
		this.retryTimers.set(doc, timer);
	}
	scheduleCleanup(doc: Document, generation: number, delayMs: number, task: () => void): void {
		this.cancelCleanup(doc);
		const timer = setTimeout(() => {
			if (this.cleanupTimers.get(doc) === timer) this.cleanupTimers.delete(doc);
			if (this.isCurrent(doc, generation)) task();
		}, delayMs);
		this.cleanupTimers.set(doc, timer);
	}
	cancelCleanup(doc?: Document): void {
		if (doc) {
			const timer = this.cleanupTimers.get(doc);
			if (timer) clearTimeout(timer);
			this.cleanupTimers.delete(doc);
			return;
		}
		for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
		this.cleanupTimers.clear();
	}
	cancelRetry(doc?: Document): void {
		if (doc) {
			const timer = this.retryTimers.get(doc);
			if (timer) clearTimeout(timer);
			this.retryTimers.delete(doc);
			return;
		}
		for (const timer of this.retryTimers.values()) clearTimeout(timer);
		this.retryTimers.clear();
	}
	dispose(): void { this.cancelCleanup(); this.cancelRetry(); }
}
