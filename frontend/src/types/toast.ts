export type ToastType = "success" | "error" | "warning" | "info";

/** Optional action link rendered inside a toast, e.g. a Stellar Expert tx link. */
export interface ToastLink {
  href: string;
  label: string;
  /** Opens in a new tab when true (default). */
  external?: boolean;
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // Duration in milliseconds before auto-dismiss
  correlationId?: string; // For unified pending/success/error lifecycle
  link?: ToastLink; // Optional action link (transaction hash explorer, etc.)
}
