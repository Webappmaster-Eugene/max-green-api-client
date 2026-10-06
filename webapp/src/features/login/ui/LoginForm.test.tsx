import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { LoginForm } from "./LoginForm";
import { setCsrfToken, request } from "../../../shared/api";
import { doneSchema } from "../../../shared/contracts";

describe("site login", () => {
  it("shows a safe login error without granting access", async () => {
    const onLogin = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: false, error: "Неверный логин или пароль." }),
            { status: 401 },
          ),
        ),
    );
    render(
      <MantineProvider env="test">
        <LoginForm onLogin={onLogin} />
      </MantineProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Логин/), "owner");
    await user.type(
      screen.getByLabelText(/^Пароль/, { selector: "input" }),
      "wrong-password",
    );
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Неверный логин или пароль.",
    );
    expect(onLogin).not.toHaveBeenCalled();
  });
  it("validates the response, uses cookies and never persists JWT in browser storage", async () => {
    const csrfToken = "a".repeat(64);
    const session = {
      user: { id: 1, login: "owner", role: "admin", active: true },
      expiresAt: Date.now() + 28800000,
      csrfToken,
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: session })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, data: { done: true } })),
      );
    vi.stubGlobal("fetch", fetcher);
    const onLogin = vi.fn();
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(
      <MantineProvider env="test">
        <LoginForm onLogin={onLogin} />
      </MantineProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Логин/), "owner");
    await user.type(
      screen.getByLabelText(/^Пароль/, { selector: "input" }),
      "fixture-password",
    );
    await user.click(screen.getByRole("button", { name: "Войти" }));
    expect(onLogin).toHaveBeenCalledWith(session);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
      headers: { "X-Max-Client": "1" },
    });
    await request("/api/auth/logout", doneSchema, { method: "POST" });
    expect(fetcher.mock.calls[1][1].headers["X-CSRF-Token"]).toBe(csrfToken);
    expect(storage).not.toHaveBeenCalled();
    setCsrfToken("");
  });
  it("rejects a malformed success response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: { token: "fake" } })),
        ),
    );
    await expect(
      request("/api/auth/logout", doneSchema, { method: "POST" }),
    ).rejects.toThrow("не соответствует контракту");
  });
});
