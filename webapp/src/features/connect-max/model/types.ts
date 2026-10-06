import type {
  MaxConnectInput,
  MaxProfile,
  MaxReconnectInput,
} from "../../../shared/contracts";
export interface ConnectionFormProps {
  busy: boolean;
  profile?: MaxProfile;
  onReconnect: (input: MaxReconnectInput) => Promise<boolean>;
  onConnect: (input: MaxConnectInput) => Promise<boolean>;
}
