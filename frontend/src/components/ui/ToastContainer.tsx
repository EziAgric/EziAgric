"use client";

import React from "react";
import { useToast } from "@/hooks/useToast";
import { Toast } from "./Toast";

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    // `aria-live` on the persistent wrapper is what makes toasts announced by
    // screen readers as they appear/update (issue #422). The region itself is
    // always mounted when there is content; individual toasts keep role="alert".
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-md pointer-events-none sm:top-6 sm:right-6"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          onClose={removeToast}
        />
      ))}
    </div>
  );
}
