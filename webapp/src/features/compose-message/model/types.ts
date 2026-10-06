import type { MaxMessageDto } from "../../../shared/contracts";
export interface ComposerProps {
  text: string;
  quote?: MaxMessageDto;
  edit?: MaxMessageDto;
  busy: boolean;
  canUpload: boolean;
  onText: (text: string) => void;
  onCancel: () => void;
  onSend: (file?: File) => Promise<boolean>;
}
