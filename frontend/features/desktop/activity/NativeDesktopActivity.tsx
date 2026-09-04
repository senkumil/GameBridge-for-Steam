import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { CommunityContentItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopActivity } from '../../../steam/desktop/adapters/SteamDesktopActivityAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkActivityErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Activity Card' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][Activity] Error in native activity card: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface NativeDesktopActivityProps {
	item: CommunityContentItem;
	fallback?: ReactNode;
}

export const NativeDesktopActivity: React.FC<NativeDesktopActivityProps> = ({
	item,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeActivity || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativeActivityCard = steamComponents.resolve('DesktopActivityCard');
	if (!NativeActivityCard) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopActivity(item);

	return (
		<NativeGameLinkActivityErrorBoundary fallback={fallback}>
			<NativeActivityCard {...props} />
		</NativeGameLinkActivityErrorBoundary>
	);
};

export function mountNativeDesktopActivity(
	container: HTMLElement,
	item: CommunityContentItem,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<NativeDesktopActivity item={item} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<NativeDesktopActivity item={item} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][Activity] Mount error: ${e}`);
	}
	return () => {};
}
