import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { Composer } from "./Composer";

it("keeps the attached file after an ambiguous failure and clears it only after success", async () => {
  const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const { container } = render(
    <MantineProvider env="test">
      <Composer
        text=""
        busy={false}
        canUpload
        onText={vi.fn()}
        onCancel={vi.fn()}
        onSend={send}
      />
    </MantineProvider>,
  );
  const file = new File(["fixture"], "note.txt", { type: "text/plain" });
  const user = userEvent.setup();
  await user.upload(container.querySelector("input[type=file]")!, file);
  await user.click(screen.getByRole("button", { name: "Отправить" }));
  expect(send).toHaveBeenCalledWith(file);
  expect(screen.getByText(/note.txt/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Отправить" }));
  expect(send).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/note.txt/)).not.toBeInTheDocument();
});
it("requires mediaUrl for attaching files and never submits an empty text", () => {
  render(
    <MantineProvider env="test">
      <Composer
        text=""
        busy={false}
        canUpload={false}
        onText={vi.fn()}
        onCancel={vi.fn()}
        onSend={vi.fn()}
      />
    </MantineProvider>,
  );
  expect(
    screen.getByRole("button", { name: "Прикрепить файл" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
});
