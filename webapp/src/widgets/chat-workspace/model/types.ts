import type { useMessenger } from "../../../features/messenger";
import type { AuthSession } from "../../../shared/contracts";
export type MessengerController = ReturnType<typeof useMessenger>;
export interface MessengerViewProps {
  controller: MessengerController;
}
export interface ChatWorkspaceProps {
  controller: MessengerController;
  identity: AuthSession;
  onSettings: () => void;
}
