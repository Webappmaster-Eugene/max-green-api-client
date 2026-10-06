import type { ReactNode } from "react";
import type { MaxMessageDto } from "../../../shared/contracts";
export interface MessageBubbleProps {
  message: MaxMessageDto;
  connectionId: string;
  actions: ReactNode;
}
