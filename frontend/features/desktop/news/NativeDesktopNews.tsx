import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { NewsItem } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopNews } from '../../../steam/desktop/adapters/SteamDesktopNewsAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkNewsErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native News Card' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][News] Error in native news card: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface NativeDesktopNewsProps {
	item: NewsItem;
	fallback?: ReactNode;
}

export const NativeDesktopNews: React.FC<NativeDesktopNewsProps> = ({
	item,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeNews || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativeNewsComponent = steamComponents.resolve('DesktopNews');
	if (!NativeNewsComponent) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopNews(item);

	return (
		<NativeGameLinkNewsErrorBoundary fallback={fallback}>
			<NativeNewsComponent {...props} />
		</NativeGameLinkNewsErrorBoundary>
	);
};

export function mountNativeDesktopNews(
	container: HTMLElement,
	item: NewsItem,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<NativeDesktopNews item={item} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<NativeDesktopNews item={item} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][News] Mount error: ${e}`);
	}
	return () => {};
}
