import type {
  MaxMessageDto,
  MaxReactionInput,
} from "../../../shared/contracts";
export interface MessageActionsProps {
  message: MaxMessageDto;
  disabled: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onForward: () => void;
  onReact: (reaction: MaxReactionInput["reaction"]) => void;
}
