/** Session-scoped navigation ownership for the desktop Library document. */
export class LibraryNavigationController {
	private readonly generations = new WeakMap<Document, number>();
	private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
	private cleanupDocument: Document | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private retryDocument: Document | null = null;

	current(doc: Document): number { return this.generations.get(doc) || 0; }
	advance(doc: Document): number {
		const next = this.current(doc) + 1;
		this.generations.set(doc, next);
		this.cancelRetry(doc);
		return next;
	}
	isCurrent(doc: Document, generation: number): boolean { return this.current(doc) === generation; }
	scheduleRetry(doc: Document, generation: number, delayMs: number, task: () => void): void {
		this.cancelRetry();
		this.retryDocument = doc;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.retryDocument = null;
			if (this.isCurrent(doc, generation)) task();
		}, delayMs);
	}
	scheduleCleanup(doc: Document, generation: number, delayMs: number, task: () => void): void {
		this.cancelCleanup();
		this.cleanupDocument = doc;
		this.cleanupTimer = setTimeout(() => {
			this.cleanupTimer = null;
			this.cleanupDocument = null;
			if (this.isCurrent(doc, generation)) task();
		}, delayMs);
	}
	cancelCleanup(doc?: Document): void {
		if (doc && this.cleanupDocument && this.cleanupDocument !== doc) return;
		if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
		this.cleanupTimer = null;
		this.cleanupDocument = null;
	}
	cancelRetry(doc?: Document): void {
		if (doc && this.retryDocument && this.retryDocument !== doc) return;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		this.retryDocument = null;
	}
	dispose(): void { this.cancelCleanup(); this.cancelRetry(); }
}
