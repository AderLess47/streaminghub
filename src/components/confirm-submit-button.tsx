"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  message,
  className = "btn btn-danger btn-sm",
  ariaLabel,
  title,
}: {
  children: ReactNode;
  message: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
