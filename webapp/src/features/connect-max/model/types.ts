import type { MaxConnectInput } from "../../../shared/contracts";
export interface ConnectionFormProps {
  busy: boolean;
  onConnect: (input: MaxConnectInput) => Promise<boolean>;
}
