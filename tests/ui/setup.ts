import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = vi.fn();
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  writable: true,
  value: vi.fn(),
});
Object.defineProperty(document, "fonts", {
  value: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ready: Promise.resolve(),
  },
});
