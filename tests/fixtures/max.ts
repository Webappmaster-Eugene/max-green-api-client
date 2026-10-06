import { GreenMaxClient } from "../../src/max/client.js";
import { MaxSessions } from "../../src/max/session.js";
import type { MaxConnectInput } from "../../types/max.js";

export const credentials: MaxConnectInput = {
  apiUrl: "https://3100.api.green-api.com",
  mediaUrl: "https://3100.api.green-api.com",
  idInstance: "3100000001",
  apiTokenInstance: "fixture_not_a_real_green_token",
  accountConsent: true,
};
import { SavedConnections } from "../../src/max/connections.js";
export function maxFixture(saved?: SavedConnections) {
  let time = Date.now();
  let notification: unknown = null;
  let ack = true;
  let sendFailure = false;
  let state = "authorized";
  let connectStatus: number | undefined;
  const calls: { method: string; body: unknown }[] = [];
  const history = [
    {
      chatId: "100",
      idMessage: "old",
      type: "incoming",
      textMessage: "Ранее",
      timestamp: Math.floor(time / 1000) - 60,
    },
    {
      chatId: "100",
      idMessage: "own",
      type: "outgoing",
      textMessage: "Мой текст",
      statusMessage: "delivered",
      timestamp: Math.floor(time / 1000) - 30,
    },
    {
      chatId: "100",
      idMessage: "image",
      type: "incoming",
      typeMessage: "imageMessage",
      downloadUrl:
        "https://sw-media-3100.storage.yandexcloud.net/fixture/photo.png",
      fileName: "photo.png",
      mimeType: "image/png",
      timestamp: Math.floor(time / 1000) - 10,
    },
  ];
  const fetcher = (async (raw, init) => {
    const method = new URL(String(raw)).pathname.split("/")[2];
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, body });
    let data: unknown;
    switch (method) {
      case "getStateInstance":
        if (connectStatus)
          return new Response("fixture provider failure", {
            status: connectStatus,
          });
        data = { stateInstance: state };
        break;
      case "getSettings":
        data = {
          typeInstance: "v3",
          webhookUrl: "",
          incomingWebhook: "yes",
          outgoingWebhook: "yes",
          outgoingMessageWebhook: "yes",
          outgoingAPIMessageWebhook: "yes",
        };
        break;
      case "getChats":
        data = [{ chatId: "100", name: "Profile", type: "user" }];
        break;
      case "getContacts":
        data = [
          { chatId: "100", contactName: "Анна", type: "user", phoneNumber: 0 },
          { chatId: "200", contactName: "Семья", type: "group" },
        ];
        break;
      case "getChatHistory":
        data = [...history].reverse();
        break;
      case "checkAccount":
        data = { exist: true, chatId: "100" };
        break;
      case "sendMessage":
      case "sendFileByUpload":
        if (sendFailure) throw new Error("Transport fixture failure");
        data = {
          idMessage: `sent-${calls.filter((c) => ["sendMessage", "sendFileByUpload"].includes(c.method)).length}`,
          urlFile:
            "https://sw-media-3100.storage.yandexcloud.net/fixture/file.txt",
        };
        break;
      case "editMessage":
        data = { idMessage: body.idMessage };
        break;
      case "deleteMessage":
        return new Response(null, { status: 200 });
      case "forwardMessages":
        data = { messages: ["forwarded-1"] };
        break;
      case "sendReaction":
        data = { idMessage: "reaction-1" };
        break;
      case "readChat":
        data = { setRead: true };
        break;
      case "receiveNotification":
        data = notification;
        break;
      case "deleteNotification":
        data = { result: ack };
        break;
      default:
        throw new Error("Unexpected provider method");
    }
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const sessions = new MaxSessions(
    (c) => new GreenMaxClient(c, fetcher),
    () => time,
    saved,
  );
  const envelope = (body: object) => ({
    receiptId: 1,
    body: {
      instanceData: { idInstance: 3100000001, typeInstance: "v3" },
      timestamp: Math.floor(time / 1000),
      ...body,
    },
  });
  return {
    sessions,
    createSessions: (saved: SavedConnections) =>
      new MaxSessions(
        (c) => new GreenMaxClient(c, fetcher),
        () => time,
        saved,
      ),
    failConnect: (status?: number) => {
      connectStatus = status;
    },
    calls,
    history,
    advance: (ms: number) => {
      time += ms;
    },
    notify: (body: object) => {
      notification = envelope(body);
    },
    ack: (value: boolean) => {
      ack = value;
    },
    failSend: () => {
      sendFailure = true;
    },
    state: (value: string) => {
      state = value;
    },
  };
}
