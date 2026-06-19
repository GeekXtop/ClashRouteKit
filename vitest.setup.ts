// Global test setup. Polyfills browser APIs that jsdom lacks but AntD needs.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  // jsdom throws "Not implemented" when getComputedStyle is called with a
  // pseudo-element argument (AntD/rc-util scrollbar measuring). Drop the 2nd arg.
  const originalGetComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((elt: Element) => originalGetComputedStyle(elt)) as typeof window.getComputedStyle;
}
