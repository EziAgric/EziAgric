export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // Duration in milliseconds before auto-dismiss
  correlationId?: string; // For unified pending/success/error lifecycle
}
