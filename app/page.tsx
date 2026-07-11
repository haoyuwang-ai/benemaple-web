'use client';

import { useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Leaf, MessageSquare } from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';

import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';

export default function Page() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat({
    transport,
  });

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text.trim();

    if (!text) {
      return;
    }

    sendMessage({ text });
  };

  return (
    <main className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <Leaf className="size-5" />
          </div>

          <div>
            <h1 className="font-semibold leading-none">BeneMaple</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Canadian benefits and tax assistant
            </p>
          </div>
        </div>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-4xl px-4 py-6">
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<MessageSquare className="size-10" />}
              title="How can BeneMaple help?"
              description="Ask about Canadian benefits, tax credits, RRSPs, and government programs."
            />
          ) : (
            messages.map((message) => (
              <Message
                key={message.id}
                from={message.role}
              >
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type !== 'text') {
                      return null;
                    }

                    return (
                      <MessageResponse
                        key={`${message.id}-${index}`}
                      >
                        {part.text}
                      </MessageResponse>
                    );
                  })}
                </MessageContent>
              </Message>
            ))
          )}

          {error && (
            <div className="mx-auto mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error.message || 'Something went wrong. Please try again.'}
            </div>
          )}
        </ConversationContent>

        <ConversationScrollButton />
      </Conversation>

      <footer className="shrink-0 border-t bg-background">
        <div className="mx-auto w-full max-w-4xl px-4 py-4">
          <PromptInputProvider>
            <PromptInput onSubmit={handleSubmit}>
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder="Ask BeneMaple a question..."
                />
              </PromptInputBody>

              <PromptInputFooter className="justify-end">
                <PromptInputSubmit status={status} />
              </PromptInputFooter>
            </PromptInput>
          </PromptInputProvider>

          <p className="mt-2 text-center text-xs text-muted-foreground">
            BeneMaple provides general information, not professional tax or
            financial advice.
          </p>
        </div>
      </footer>
    </main>
  );
}