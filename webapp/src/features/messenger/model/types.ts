import type { MaxMessageDto } from "../../../shared/contracts";
export interface MessageDraft {
  text: string;
  quote?: MaxMessageDto;
  edit?: MaxMessageDto;
  beforeEdit?: string;
}
