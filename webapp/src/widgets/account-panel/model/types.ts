import type { AuthSession, MaxSessionDto } from "../../../shared/contracts";
export interface AccountPanelProps {
  opened: boolean;
  onClose: () => void;
  identity: AuthSession;
  connection: MaxSessionDto | null;
  busy: boolean;
  onDisconnect: () => Promise<boolean>;
  onLogout: () => Promise<void>;
  onPasswordChanged: () => void;
}
