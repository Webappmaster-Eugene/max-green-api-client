import type { AuthSession } from "../../../shared/contracts";
export interface LoginPageProps {
  onLogin: (session: AuthSession) => void;
}
