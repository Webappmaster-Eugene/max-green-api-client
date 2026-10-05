import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaxPage } from "./MaxPage";
import type { api } from "../api/client";
import type { MaxSessionDto } from "@shared/max";

const session: MaxSessionDto = {
  connectionId: "752e7697-fdc2-45b4-93bb-09d5e24ad122", idInstance: "3100000001", account: "79990000000@c.us",
  expiresAt: Date.now() + 100000, chats: [{ id: "10000000", title: "Получатель" }], messages: [], contacts: [{ id: "20000000", title: "Анна", phone: "79991234567" }],
};
function clientFor(initial: MaxSessionDto | null = session) {
  const get = vi.fn().mockResolvedValue(structuredClone(initial));
  const post = vi.fn(async (path: string) => {
    if (path === "/api/max/connect" || path === "/api/max/poll" || path === "/api/max/history") return structuredClone(session);
    if (path === "/api/max/chats") return { id: "20000000", title: "+79991234567" };
    if (path === "/api/max/send") return { id: "outgoing-1", chatId: "10000000", text: "Привет!", direction: "outgoing", timestamp: Date.now(), status: "queued" };
    return { disconnected: true };
  });
  return { get, post, client: { get, post } as Pick<typeof api, "get" | "post"> };
}
afterEach(() => { vi.useRealTimers(); });

describe("MAX chat", () => {
  it("requires account consent and clears the key after connection/disconnection", async () => {
    const f = clientFor(null); const user = userEvent.setup(); render(<MaxPage client={f.client} />);
    await screen.findByText("Подключите аккаунт MAX");
    await user.type(screen.getByLabelText("Адрес API (apiUrl)"), "https://3100.api.green-api.com");
    await user.type(screen.getByLabelText("Номер инстанса (idInstance)"), "3100000001");
    await user.type(screen.getByLabelText("Ключ доступа (apiTokenInstance)"), "test_key_not_a_real_token");
    expect(screen.getByRole("button", { name: "Подключить MAX" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Подключить MAX" }));
    await screen.findByRole("button", { name: "Настройки подключения" });
    expect(f.post).toHaveBeenCalledWith("/api/max/connect", expect.objectContaining({ accountConsent: true, apiTokenInstance: "test_key_not_a_real_token" }));
    expect(JSON.stringify(localStorage)).not.toContain("test_key_not_a_real_token");
    await user.click(screen.getByRole("button", { name: "Настройки подключения" }));
    await user.click(screen.getByRole("button", { name: "Отключить" }));
    await screen.findByText("Подключите аккаунт MAX");
    expect(screen.getByLabelText("Ключ доступа (apiTokenInstance)")).toHaveValue("");
  });
  it("creates a phone chat and keeps drafts scoped to their recipient", async () => {
    const f = clientFor(); const user = userEvent.setup(); render(<MaxPage client={f.client} />);
    await user.click(await screen.findByRole("button", { name: /Получатель/ }));
    const composer = await screen.findByLabelText("Сообщение в MAX");
    await user.type(composer, "Привет!");
    await user.click(screen.getByRole("button", { name: "Новый чат" }));
    await user.type(screen.getByLabelText("Новый чат по номеру"), "+79991234567");
    await user.click(screen.getByRole("button", { name: "Создать чат" }));
    await waitFor(() => expect(composer).toHaveValue(""));
    expect(f.post).toHaveBeenCalledWith("/api/max/chats", { connectionId: session.connectionId, phone: "+79991234567" });
    await user.click(screen.getByRole("button", { name: /Получатель/ }));
    expect(composer).toHaveValue("Привет!");
  });
  it("shows queue acceptance and reuses the request ID when the server reply is lost", async () => {
    const f = clientFor(); const user = userEvent.setup();
    let attempts = 0;
    f.post.mockImplementation(async (path: string) => {
      if (path === "/api/max/history") return structuredClone(session);
      if (path === "/api/max/send" && ++attempts === 1) throw new Error("Ответ сервера потерян");
      return { id: "outgoing-1", chatId: "10000000", text: "Привет!", direction: "outgoing", timestamp: Date.now(), status: "queued" };
    });
    render(<MaxPage client={f.client} />);
    await user.click(await screen.findByRole("button", { name: /Получатель/ }));
    await user.type(await screen.findByLabelText("Сообщение в MAX"), "Привет!");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await screen.findByText("Ответ сервера потерян");
    expect(screen.getByLabelText("Сообщение в MAX")).toHaveValue("Привет!");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await screen.findByText("В очереди");
    const sends = f.post.mock.calls.filter(call => call[0] === "/api/max/send") as unknown as [string, { requestId: string; chatId: string }][];
    expect(sends).toHaveLength(2);
    expect(sends[0][1].requestId).toBe(sends[1][1].requestId);
    expect(sends[0][1].chatId).toBe("10000000");
    expect(screen.getByLabelText("Сообщение в MAX")).toHaveValue("");
  });
  it("renders received text as text and stops polling after leaving the page", async () => {
    vi.useFakeTimers(); const f = clientFor();
    f.post.mockResolvedValue({ ...session, messages: [{ id: "incoming-1", chatId: "10000000", text: "<script>private</script>", direction: "incoming", timestamp: Date.now() }] });
    const view = render(<MaxPage client={f.client} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Получатель/ }));
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(within(screen.getByRole("log")).getByText("<script>private</script>")).toBeInTheDocument();
    expect(document.querySelector(".max-messages script")).toBeNull();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(f.post.mock.calls.filter(call => call[0] === "/api/max/poll")).toHaveLength(1);
  });
  it("waits for an active poll before starting a send", async () => {
    vi.useFakeTimers(); const f = clientFor(); let finishPoll!: (value: MaxSessionDto) => void;
    f.post.mockImplementation(async (path: string) => {
      if (path === "/api/max/history") return structuredClone(session);
      if (path === "/api/max/poll") return new Promise(resolve => { finishPoll = resolve; });
      return { id: "outgoing-1", chatId: "10000000", text: "Привет!", direction: "outgoing", timestamp: Date.now(), status: "queued" };
    });
    render(<MaxPage client={f.client} />); await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Получатель/ })); await act(async () => {});
    fireEvent.change(screen.getByLabelText("Сообщение в MAX"), { target: { value: "Привет!" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    fireEvent.submit(screen.getByLabelText("Сообщение в MAX").closest("form")!);
    expect(f.post.mock.calls.filter(call => call[0] === "/api/max/send")).toHaveLength(0);
    await act(async () => { finishPoll(structuredClone(session)); });
    expect(f.post.mock.calls.filter(call => call[0] === "/api/max/send")).toHaveLength(1);
    expect(screen.getByText("В очереди")).toBeInTheDocument();
  });
});
