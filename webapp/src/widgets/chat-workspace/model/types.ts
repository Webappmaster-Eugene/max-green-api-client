import type { useMessenger } from "../../../features/messenger";
export type MessengerController = ReturnType<typeof useMessenger>;
export interface MessengerViewProps {
  controller: MessengerController;
}
export interface ChatWorkspaceProps {
  controller: MessengerController;
  identity: { user: { login: string } };
  onSettings: () => void;
}
