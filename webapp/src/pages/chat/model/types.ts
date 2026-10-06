import type { AuthSession } from "../../../shared/contracts";
export interface ChatPageProps {
  identity: AuthSession;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
}
