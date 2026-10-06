import type { GreenMaxClient } from "../src/max/client.js";
import type { MaxError } from "../src/max/error.js";
import type { MaxSessionDto, MaxMessageDto } from "./max.js";
export interface SendAttempt {
  signature: string;
  message?: MaxMessageDto;
  error?: MaxError;
}
export interface MaxSession {
  client: GreenMaxClient;
  dto: MaxSessionDto;
  busy: boolean;
  lastSendAt: number;
  attempts: Map<string, SendAttempt>;
  historyCounts: Map<string, number>;
  media: Map<string, string>;
  mediaRequests: Map<string, Promise<string>>;
  mediaQueue: Promise<void>;
  mediaNextAt: number;
}
export interface MediaSource {
  url: string;
  message: MaxMessageDto;
}
export type MediaResolver = (refresh: boolean) => Promise<MediaSource>;
export interface DownloadedAttachment extends DownloadedMedia {
  message: MaxMessageDto;
}
export interface DownloadedMedia {
  bytes: Uint8Array;
  mimeType: string;
}
