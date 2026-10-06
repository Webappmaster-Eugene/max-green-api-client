import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MantineProvider } from "@mantine/core";
import { ConnectionForm } from "./ConnectionForm";
const profile = {
  apiUrl: "https://3100.api.green-api.com",
  mediaUrl: "https://3100.api.green-api.com",
  idInstance: "3100000001",
};
describe("saved MAX login", () => {
  it("requests only the key for a saved account, without sending URLs from the browser", async () => {
    const onConnect = vi.fn();
    const onReconnect = vi.fn().mockResolvedValue(true);
    render(
      <MantineProvider env="test">
        <ConnectionForm
          busy={false}
          profile={profile}
          onConnect={onConnect}
          onReconnect={onReconnect}
        />
      </MantineProvider>,
    );
    expect(screen.queryByLabelText(/^Адрес API/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Номер инстанса/)).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/^Ключ GREEN-API/, { selector: "input" }),
      "fixture_not_a_real_green_token",
    );
    await user.click(screen.getByRole("button", { name: "Войти в MAX" }));
    expect(onReconnect).toHaveBeenCalledWith({
      apiTokenInstance: "fixture_not_a_real_green_token",
    });
    expect(onConnect).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(/^Ключ GREEN-API/, { selector: "input" }),
    ).toHaveValue("");
  });
  it("allows replacing the saved instance and requires new account consent", async () => {
    render(
      <MantineProvider env="test">
        <ConnectionForm
          busy={false}
          profile={profile}
          onConnect={vi.fn()}
          onReconnect={vi.fn()}
        />
      </MantineProvider>,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Подключить другой инстанс" }),
    );
    expect(screen.getByLabelText(/^Адрес API/)).toHaveValue(profile.apiUrl);
    expect(screen.getByLabelText(/^Номер инстанса/)).toHaveValue(
      profile.idInstance,
    );
    expect(
      screen.getByRole("button", { name: "Подключить MAX" }),
    ).toBeDisabled();
  });
});
