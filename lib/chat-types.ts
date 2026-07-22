import type { UIMessage } from 'ai';

export type SourceLink = {
  score: number | null;
  title: string;
  section: string;
  url: string;
};

export type ChatDataParts = {
  sources: SourceLink[];
};

export type ChatMessage = UIMessage<
  unknown,
  ChatDataParts
>;