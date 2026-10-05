/**
 * Окружение компонентных тестов.
 *
 * jsdom не знает ни Telegram, ни микрофона, ни вибрации. Заглушки живут здесь,
 * а не в каждом файле: половина компонентов трогает их на первом же рендере, и
 * без общей подготовки падал бы каждый второй тест по причине, к тесту
 * отношения не имеющей.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// Мост Telegram: SDK ищет именно его и без него уходит в жёсткую ошибку.
Object.defineProperty(window, "TelegramWebviewProxy", {
  writable: true,
  value: { postEvent: () => {} },
});

// matchMedia нужен теме и адаптивным хукам; в jsdom его нет вовсе.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ResizeObserver дергают списки с автопрокруткой.
Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

Object.defineProperty(window, "scrollTo", { writable: true, value: () => {} });

// Захват указателя: в браузерах он есть везде, в jsdom не реализован вовсе, и
// любой клик по холсту древа падал бы на releasePointerCapture.
for (const name of ["hasPointerCapture", "setPointerCapture", "releasePointerCapture"] as const) {
  if (!(name in Element.prototype)) {
    Object.defineProperty(Element.prototype, name, {
      writable: true,
      value: name === "hasPointerCapture" ? () => false : () => {},
    });
  }
}

// Вибрация: haptic-хук зовёт её на каждом нажатии.
Object.defineProperty(navigator, "vibrate", { writable: true, value: vi.fn(() => true) });
