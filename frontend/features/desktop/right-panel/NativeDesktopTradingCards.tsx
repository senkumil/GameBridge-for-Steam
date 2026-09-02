import React, { Component, ErrorInfo, ReactNode } from 'react';
import type { SteamCommunityItemsCatalog } from '../../../domain/types';
import { backendLog } from '../../../api/backend';
import { steamComponents } from '../../../steam/modules/SteamComponentResolver';
import { desktopFeatureFlags } from '../flags';
import { toSteamDesktopTradingCards } from '../../../steam/desktop/adapters/SteamDesktopTradingCardsAdapter';

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: string;
}

export class NativeGameLinkTradingCardsErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false, error: '' };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error: error?.message || 'Error in Desktop Native Trading Cards' };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		backendLog(`[NGL][Desktop][TradingCards] Error in native trading cards: ${error} stack: ${info.componentStack}`);
	}

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback || null;
		}
		return this.props.children;
	}
}

interface NativeDesktopTradingCardsProps {
	catalog: SteamCommunityItemsCatalog;
	fallback?: ReactNode;
}

export const NativeDesktopTradingCards: React.FC<NativeDesktopTradingCardsProps> = ({
	catalog,
	fallback,
}) => {
	if (!desktopFeatureFlags.desktopNativeRightPanel || !desktopFeatureFlags.desktopNativeUIEnabled) {
		return fallback ? <>{fallback}</> : null;
	}

	const NativeCardsComponent = steamComponents.resolve('DesktopActivityCard');
	if (!NativeCardsComponent) {
		return fallback ? <>{fallback}</> : null;
	}

	const props = toSteamDesktopTradingCards(catalog);

	return (
		<NativeGameLinkTradingCardsErrorBoundary fallback={fallback}>
			<NativeCardsComponent {...props} />
		</NativeGameLinkTradingCardsErrorBoundary>
	);
};

export function mountNativeDesktopTradingCards(
	container: HTMLElement,
	catalog: SteamCommunityItemsCatalog,
): () => void {
	const win = container.ownerDocument.defaultView as any;
	const reactDom = win?.ReactDOM || (typeof window !== 'undefined' ? (window as any).ReactDOM : null);
	if (!reactDom) return () => {};

	try {
		if (typeof reactDom.createRoot === 'function') {
			const root = reactDom.createRoot(container);
			root.render(<NativeDesktopTradingCards catalog={catalog} />);
			return () => {
				try { root.unmount(); } catch {}
			};
		}
		if (typeof reactDom.render === 'function') {
			reactDom.render(<NativeDesktopTradingCards catalog={catalog} />, container);
			return () => {
				try { reactDom.unmountComponentAtNode?.(container); } catch {}
			};
		}
	} catch (e) {
		backendLog(`[NGL][Desktop][TradingCards] Mount error: ${e}`);
	}
	return () => {};
}
