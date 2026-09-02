import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { LocalAchievementItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { findTopAchievementCandidates } from '../../../steam/modules/signatures/achievements';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopAchievement } from '../../../steam/desktop/adapters/SteamDesktopAchievementAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkDesktopErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Steam Component' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][Achievements] Error in native achievement component: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface SingleDesktopNativeAchievementProps {
	achievement: LocalAchievementItem;
	appId?: number;
	fallback?: ReactNode;
}

export const SingleDesktopNativeAchievement: React.FC<SingleDesktopNativeAchievementProps> = ({
	achievement,
	appId,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeAchievements || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const candidates = findTopAchievementCandidates(1);
	const best = candidates[0];

	if (!best || !best.component) {
		backendLog('[NGL][Desktop][Achievements] No verified Desktop Steam Achievement component resolved');
		return fallback ? <>{fallback}</> : null;
	}

	backendLog(`[NGL][Desktop][Achievements] Rendering single achievement "${achievement.display_name || achievement.name}" with native Desktop component (moduleId: ${best.moduleId}, key: "${best.exportKey}", score: ${best.score})`);

	const NativeComponent = best.component;
	const props = toSteamDesktopAchievement(achievement, { appId });

	return (
		<NativeGameLinkDesktopErrorBoundary fallback={fallback}>
			<NativeComponent {...props} />
		</NativeGameLinkDesktopErrorBoundary>
	);
};

/** Mount single native desktop achievement into a container */
export function mountSingleDesktopNativeAchievement(
	container: HTMLElement,
	achievement: LocalAchievementItem,
	appId?: number,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<SingleDesktopNativeAchievement achievement={achievement} appId={appId} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<SingleDesktopNativeAchievement achievement={achievement} appId={appId} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][Achievements] Failed to mount native root: ${e}`);
	}
	return () => {};
}
