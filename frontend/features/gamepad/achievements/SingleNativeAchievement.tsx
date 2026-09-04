import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { LocalAchievementItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { findTopAchievementCandidates } from '../../../steam/modules/signatures/achievements';
import { gamepadFeatureFlags } from '../flags';
import { toSteamAchievement } from './SteamAchievementAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkGamepadErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error inside Native Steam Component' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Achievements] Error in native achievement component: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || (
				<div style={{ padding: '8px 12px', background: 'rgba(50, 20, 20, 0.8)', color: '#ffaaaa', borderRadius: '4px' }}>
					[NGL] Native achievement render fallback: {this.state.error}
				</div>
			);
		}
		return this.props.children;
	}
}

interface SingleNativeAchievementProps {
	achievement: LocalAchievementItem;
	fallback?: ReactNode;
}

export const SingleNativeAchievement: React.FC<SingleNativeAchievementProps> = ({ achievement, fallback }) => {
	if (!gamepadFeatureFlags.gamepadNativeAchievements) {
		return fallback ? <>{fallback}</> : null;
	}

	const candidates = findTopAchievementCandidates(1);
	const best = candidates[0];

	if (!best || !best.component) {
		backendLog('[NGL][Achievements] No verified Steam Achievement React component resolved yet');
		return fallback ? <>{fallback}</> : null;
	}

	backendLog(`[NGL][Achievements] Rendering single achievement "${achievement.display_name || achievement.name}" using Steam Native Component (moduleId: ${best.moduleId}, key: "${best.exportKey}", score: ${best.score})`);

	const NativeComponent = best.component;
	const props = toSteamAchievement(achievement);

	return (
		<NativeGameLinkGamepadErrorBoundary fallback={fallback}>
			<NativeComponent {...props} />
		</NativeGameLinkGamepadErrorBoundary>
	);
};

/** Mount the single native achievement into a DOM container element in Big Picture */
export function mountSingleNativeAchievement(
	container: HTMLElement,
	achievement: LocalAchievementItem,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<SingleNativeAchievement achievement={achievement} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<SingleNativeAchievement achievement={achievement} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Achievements] Failed to mount native achievement root: ${e}`);
	}
	return () => {};
}
