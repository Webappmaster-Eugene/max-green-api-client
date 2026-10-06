import type { MaxChatDto } from "../../../shared/contracts";
export interface ChatItemProps {
  chat: MaxChatDto;
  selected: boolean;
  disabled: boolean;
  contact: boolean;
  onSelect: () => void;
}
