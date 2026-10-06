import { it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { MessageBubble } from "./MessageBubble";
import { requestMedia } from "../../../shared/api";
vi.mock("../../../shared/api", () => ({
  requestMedia: vi.fn(),
  messageError: (e: Error) => e.message,
}));
beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:fixture"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});
it("loads video through the authenticated transport and displays a controlled player", async () => {
  vi.mocked(requestMedia).mockResolvedValue(new Blob(["fixture"]));
  const view = render(
    <MantineProvider env="test">
      <MessageBubble
        actions={null}
        connectionId="connection"
        message={{
          id: "clip",
          chatId: "100",
          text: "",
          direction: "incoming",
          timestamp: Date.now(),
          attachment: {
            kind: "video",
            fileName: "clip.mp4",
            mimeType: "video/mp4",
            available: true,
          },
        }}
      />
    </MantineProvider>,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Посмотреть видео" }),
  );
  expect(requestMedia).toHaveBeenCalledWith(
    expect.stringContaining("messageId=clip"),
    expect.any(AbortSignal),
  );
  expect(document.querySelector("video")).toHaveAttribute("controls");
  expect(document.querySelector("video")).toHaveAttribute(
    "src",
    "blob:fixture",
  );
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture");
});
it("shows a clear error when a file cannot be downloaded", async () => {
  vi.mocked(requestMedia).mockRejectedValue(new Error("Срок ссылки истёк"));
  render(
    <MantineProvider env="test">
      <MessageBubble
        actions={null}
        connectionId="connection"
        message={{
          id: "doc",
          chatId: "100",
          text: "",
          direction: "incoming",
          timestamp: Date.now(),
          attachment: {
            kind: "document",
            fileName: "note.pdf",
            mimeType: "application/pdf",
            available: true,
          },
        }}
      />
    </MantineProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Скачать" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Срок ссылки истёк",
  );
});
