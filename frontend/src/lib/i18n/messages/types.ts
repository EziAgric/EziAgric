import type en from "./en";

/** Widen the `as const` literal values of the base catalog to plain strings. */
type Widen<T> = {
  [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};

/** Every non-default catalog may omit keys; missing keys fall back to `en`. */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]>;
};

export type Messages = Widen<typeof en>;

export type PartialMessages = DeepPartial<Messages>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dot-notation key of a message in the base catalog, e.g. "wallet.connect". */
export type MessageKey = Leaves<typeof en>;
