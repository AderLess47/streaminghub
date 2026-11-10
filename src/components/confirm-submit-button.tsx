"use client";

import type { ReactNode } from "react";

export function ConfirmSubmitButton({
  children,
  message,
  className = "btn btn-danger btn-sm",
}: {
  children: ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
