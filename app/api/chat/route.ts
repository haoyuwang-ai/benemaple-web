import {
  JsonToSseTransformStream,
  type UIMessageChunk,
} from 'ai';

import type {
  ChatDataParts,
  SourceLink,
} from '@/lib/chat-types';

type ChatChunk = UIMessageChunk<unknown, ChatDataParts>;

type AiSdkTextPart = {
  type?: string;
  text?: string;
};

type AiSdkMessage = {
  role?: string;
  parts?: AiSdkTextPart[];
};

type AiSdkChatRequest = {
  messages?: AiSdkMessage[];
};

type BackendSseEvent = {
  event: string;
  data: string;
};

function getLatestUserQuestion(messages: AiSdkMessage[] | undefined) {
  if (!Array.isArray(messages)) {
    return null;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== 'user' || !Array.isArray(message.parts)) {
      continue;
    }

    const question = message.parts
      .filter(
        (part) =>
          part.type === 'text' &&
          typeof part.text === 'string',
      )
      .map((part) => part.text)
      .join('\n')
      .trim();

    if (question) {
      return question;
    }
  }

  return null;
}

function parseBackendSseEvent(block: string): BackendSseEvent {
  let event = 'message';
  const dataLines: string[] = [];

  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r')
      ? rawLine.slice(0, -1)
      : rawLine;

    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  return {
    event,
    data: dataLines.join('\n'),
  };
}

function isSourceLink(value: unknown): value is SourceLink {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const source = value as Record<string, unknown>;

  return (
    (typeof source.score === 'number' || source.score === null) &&
    typeof source.title === 'string' &&
    typeof source.section === 'string' &&
    typeof source.url === 'string'
  );
}

export async function POST(request: Request) {
  const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/$/, '');

  const apiInternalToken = process.env.API_INTERNAL_TOKEN;

  if (!apiInternalToken) {
    return Response.json(
      { error: 'API_INTERNAL_TOKEN is not configured' },
      { status: 500 },
    );
  }
  if (!apiBaseUrl) {
    return Response.json(
      { error: 'API_BASE_URL is not configured' },
      { status: 500 },
    );
  }

  let body: AiSdkChatRequest;

  try {
    body = (await request.json()) as AiSdkChatRequest;
  } catch {
    return Response.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 },
    );
  }

  const question = getLatestUserQuestion(body.messages);

  if (!question) {
    return Response.json(
      { error: 'A user text message is required' },
      { status: 400 },
    );
  }

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(`${apiBaseUrl}/questions/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Internal-API-Key': apiInternalToken,
      },
      body: JSON.stringify({
        question,
        profile: {},
      }),
      cache: 'no-store',
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return new Response(null, { status: 499 });
    }

    console.error('Failed to reach the questions API:', error);

    return Response.json(
      { error: 'Unable to reach the questions API' },
      { status: 502 },
    );
  }

  if (!upstreamResponse.ok) {
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: {
        'Content-Type':
          upstreamResponse.headers.get('Content-Type') ??
          'application/json',
      },
    });
  }

  if (!upstreamResponse.body) {
    return Response.json(
      { error: 'The questions API returned an empty response' },
      { status: 502 },
    );
  }

  const decoder = new TextDecoder();
  const textPartId = crypto.randomUUID();
  const sourcesPartId = crypto.randomUUID();

  let buffer = '';
  let finished = false;

  function finishMessage(
    controller: TransformStreamDefaultController<ChatChunk>,
    finishReason: 'stop' | 'other',
  ) {
    if (finished) {
      return;
    }

    controller.enqueue({
      type: 'text-end',
      id: textPartId,
    });
    controller.enqueue({ type: 'finish-step' });
    controller.enqueue({
      type: 'finish',
      finishReason,
    });

    finished = true;
  }

  function translateBackendEvent(
    block: string,
    controller: TransformStreamDefaultController<ChatChunk>,
  ) {
    const backendEvent = parseBackendSseEvent(block);

    if (backendEvent.event === 'token') {
      const payload = JSON.parse(backendEvent.data) as {
        text?: unknown;
      };

      if (typeof payload.text !== 'string') {
        throw new Error('Invalid token event');
      }

      controller.enqueue({
        type: 'text-delta',
        id: textPartId,
        delta: payload.text,
      });
      return;
    }

    if (backendEvent.event === 'sources') {
      const payload = JSON.parse(backendEvent.data) as {
        sources?: unknown;
      };

      if (
        !Array.isArray(payload.sources) ||
        !payload.sources.every(isSourceLink)
      ) {
        throw new Error('Invalid sources event');
      }

      controller.enqueue({
        type: 'data-sources',
        id: sourcesPartId,
        data: payload.sources,
      });
      return;
    }

    if (backendEvent.event === 'done') {
      finishMessage(controller, 'stop');
    }
  }

  const translator = new TransformStream<Uint8Array, ChatChunk>({
    start(controller) {
      controller.enqueue({
        type: 'start',
        messageId: crypto.randomUUID(),
      });
      controller.enqueue({ type: 'start-step' });
      controller.enqueue({
        type: 'text-start',
        id: textPartId,
      });
    },

    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let boundaryIndex = buffer.indexOf('\n\n');

      while (boundaryIndex !== -1) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        if (block.trim()) {
          translateBackendEvent(block, controller);
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    },

    flush(controller) {
      buffer += decoder.decode();

      if (buffer.trim()) {
        translateBackendEvent(buffer, controller);
      }

      if (!finished) {
        controller.enqueue({
          type: 'error',
          errorText: 'The questions API stream ended unexpectedly',
        });
        finishMessage(controller, 'other');
      }
    },
  });

  const aiSdkStream = upstreamResponse.body
    .pipeThrough(translator)
    .pipeThrough(new JsonToSseTransformStream())
    .pipeThrough(new TextEncoderStream());

  return new Response(aiSdkStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'x-vercel-ai-ui-message-stream': 'v1',
    },
  });
}
