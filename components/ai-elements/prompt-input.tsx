"use client";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { ChatStatus, FileUIPart } from "ai";
import {
  CornerDownLeftIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type {
  ChangeEvent,
  ComponentProps,
  FormEvent,
  FormEventHandler,
  HTMLAttributes,
  KeyboardEventHandler,
  PropsWithChildren,
} from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type PromptInputContextValue = {
  clear: () => void;
  setValue: (value: string) => void;
  value: string;
};

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

function usePromptInputContext() {
  const context = useContext(PromptInputContext);

  if (!context) {
    throw new Error("PromptInput must be wrapped in PromptInputProvider");
  }

  return context;
}

export type PromptInputProviderProps = PropsWithChildren<{
  initialInput?: string;
}>;

export const PromptInputProvider = ({
  children,
  initialInput = "",
}: PromptInputProviderProps) => {
  const [value, setValue] = useState(initialInput);
  const clear = useCallback(() => setValue(""), []);
  const context = useMemo(
    () => ({ clear, setValue, value }),
    [clear, value],
  );

  return (
    <PromptInputContext.Provider value={context}>
      {children}
    </PromptInputContext.Provider>
  );
};

export interface PromptInputMessage {
  text: string;
  files: FileUIPart[];
}

export type PromptInputProps = Omit<
  HTMLAttributes<HTMLFormElement>,
  "onSubmit"
> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => Promise<void> | void;
};

export const PromptInput = ({
  children,
  className,
  onSubmit,
  ...props
}: PromptInputProps) => {
  const input = usePromptInputContext();

  const handleSubmit: FormEventHandler<HTMLFormElement> = useCallback(
    async (event) => {
      event.preventDefault();

      const text = input.value;
      const result = onSubmit({ files: [], text }, event);

      if (result instanceof Promise) {
        await result;
      }

      input.clear();
    },
    [input, onSubmit],
  );

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({
  className,
  ...props
}: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<
  typeof InputGroupTextarea
>;

export const PromptInputTextarea = ({
  className,
  onChange,
  onKeyDown,
  placeholder = "What would you like to know?",
  ...props
}: PromptInputTextareaProps) => {
  const input = usePromptInputContext();
  const [isComposing, setIsComposing] = useState(false);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      input.setValue(event.currentTarget.value);
      onChange?.(event);
    },
    [input, onChange],
  );

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event);

      if (
        event.defaultPrevented ||
        event.key !== "Enter" ||
        event.shiftKey ||
        isComposing ||
        event.nativeEvent.isComposing
      ) {
        return;
      }

      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    },
    [isComposing, onKeyDown],
  );

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onChange={handleChange}
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      value={input.value}
      {...props}
    />
  );
};

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export const PromptInputFooter = ({
  className,
  ...props
}: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn("justify-between gap-1", className)}
    {...props}
  />
);

export type PromptInputSubmitProps = ComponentProps<
  typeof InputGroupButton
> & {
  onStop?: () => void;
  status?: ChatStatus;
};

export const PromptInputSubmit = ({
  children,
  className,
  onClick,
  onStop,
  size = "icon-sm",
  status,
  variant = "default",
  ...props
}: PromptInputSubmitProps) => {
  const isGenerating = status === "submitted" || status === "streaming";

  let icon = <CornerDownLeftIcon className="size-4" />;

  if (status === "submitted") {
    icon = <Spinner />;
  } else if (status === "streaming") {
    icon = <SquareIcon className="size-4" />;
  } else if (status === "error") {
    icon = <XIcon className="size-4" />;
  }

  const handleClick = useCallback<
    NonNullable<PromptInputSubmitProps["onClick"]>
  >(
    (event) => {
      if (isGenerating && onStop) {
        event.preventDefault();
        onStop();
        return;
      }

      onClick?.(event);
    },
    [isGenerating, onClick, onStop],
  );

  return (
    <InputGroupButton
      aria-label={isGenerating ? "Stop" : "Submit"}
      className={cn(className)}
      onClick={handleClick}
      size={size}
      type={isGenerating && onStop ? "button" : "submit"}
      variant={variant}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  );
};
