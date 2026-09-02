import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { LocalAchievementItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopAchievementSection } from '../../../steam/desktop/adapters/SteamDesktopAchievementAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkAchievementSectionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Achievement Section' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][Achievements] Error in native section: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface DesktopNativeAchievementSectionProps {
	items: LocalAchievementItem[];
	unlocked: number;
	total: number;
	onViewAll?: () => void;
	fallback?: ReactNode;
}

export const DesktopNativeAchievementSection: React.FC<DesktopNativeAchievementSectionProps> = ({
	items,
	unlocked,
	total,
	onViewAll,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeAchievements || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativeSectionComponent = steamComponents.resolve('DesktopAchievementSection');
	if (!NativeSectionComponent) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopAchievementSection(items, unlocked, total, { onViewAll });

	return (
		<NativeGameLinkAchievementSectionErrorBoundary fallback={fallback}>
			<NativeSectionComponent {...props} />
		</NativeGameLinkAchievementSectionErrorBoundary>
	);
};

export function mountDesktopNativeAchievementSection(
	container: HTMLElement,
	items: LocalAchievementItem[],
	unlocked: number,
	total: number,
	options?: { onViewAll?: () => void },
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(
				<DesktopNativeAchievementSection
					items={items}
					unlocked={unlocked}
					total={total}
					onViewAll={options?.onViewAll}
				/>
			);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(
				<DesktopNativeAchievementSection
					items={items}
					unlocked={unlocked}
					total={total}
					onViewAll={options?.onViewAll}
				/>,
				container
			);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][Achievements] Section mount error: ${e}`);
	}
	return () => {};
}
