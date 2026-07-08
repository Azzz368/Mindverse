"use client";

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type ImeDraftOptions = {
  value: string;
  onValueChange: (value: string) => void;
};

function useImeDraft({ value, onValueChange }: ImeDraftOptions) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  const composingRef = useRef(false);
  const focusedRef = useRef(false);

  const setDraftValue = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (!focusedRef.current && !composingRef.current) setDraftValue(value);
  }, [value]);

  const commit = (next: string) => {
    setDraftValue(next);
    onValueChange(next);
  };

  return {
    draft,
    setDraft: setDraftValue,
    composingRef,
    onFocus: () => {
      focusedRef.current = true;
    },
    onBlur: () => {
      focusedRef.current = false;
      if (!composingRef.current) onValueChange(draftRef.current);
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (next: string) => {
      composingRef.current = false;
      commit(next);
    },
  };
}

type ImeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export const ImeInput = forwardRef<HTMLInputElement, ImeInputProps>(function ImeInput({ value, onValueChange, className = "", onFocus, onBlur, onCompositionStart, onCompositionEnd, onPointerDown, onKeyDown, ...props }, ref) {
  const ime = useImeDraft({ value, onValueChange });
  return (
    <input
      ref={ref}
      {...props}
      value={ime.draft}
      className={`nodrag nopan nowheel ${className}`}
      onFocus={(event) => {
        ime.onFocus();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        ime.onBlur();
        onBlur?.(event);
      }}
      onCompositionStart={(event) => {
        ime.onCompositionStart();
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        ime.onCompositionEnd(event.currentTarget.value);
        onCompositionEnd?.(event);
      }}
      onChange={(event) => {
        ime.setDraft(event.currentTarget.value);
        if (!ime.composingRef.current) onValueChange(event.currentTarget.value);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
    />
  );
});

type ImeTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export const ImeTextarea = forwardRef<HTMLTextAreaElement, ImeTextareaProps>(function ImeTextarea({ value, onValueChange, className = "", onFocus, onBlur, onCompositionStart, onCompositionEnd, onPointerDown, onKeyDown, ...props }, ref) {
  const ime = useImeDraft({ value, onValueChange });
  return (
    <textarea
      ref={ref}
      {...props}
      value={ime.draft}
      className={`nodrag nopan nowheel ${className}`}
      onFocus={(event) => {
        ime.onFocus();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        ime.onBlur();
        onBlur?.(event);
      }}
      onCompositionStart={(event) => {
        ime.onCompositionStart();
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        ime.onCompositionEnd(event.currentTarget.value);
        onCompositionEnd?.(event);
      }}
      onChange={(event) => {
        ime.setDraft(event.currentTarget.value);
        if (!ime.composingRef.current) onValueChange(event.currentTarget.value);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
    />
  );
});
