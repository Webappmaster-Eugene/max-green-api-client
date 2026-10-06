import type { AuthSession } from "../../../shared/contracts";
export interface LoginFormProps {
  onLogin: (session: AuthSession) => void;
}
