"use client";

import React from "react";

export interface TabItem<T extends React.Key = string> {
  value: T;
  label: string;
}

export interface TabsProps<T extends React.Key = string> {
  items: TabItem<T>[];
  activeValue: T;
  onChange: (value: T) => void;
  variant?: "underline" | "bordered";
  className?: string;
}

export function Tabs<T extends React.Key = string>({
  items,
  activeValue,
  onChange,
  variant = "underline",
  className = "",
}: TabsProps<T>) {
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const current = tabs.indexOf(event.target as HTMLButtonElement);
    if (current === -1 || tabs.length === 0) return;

    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabs[next].focus();
    onChange(items[next].value);
  }

  return (
    <div role="tablist" onKeyDown={handleKeyDown} className={`flex gap-2 ${variant === "underline" ? "border-b border-border-default pb-px" : ""} ${className}`}>
      {items.map((item) => {
        const isActive = activeValue === item.value;

        if (variant === "underline") {
          return (
            <button
              key={item.value}
              onClick={() => onChange(item.value)}
              aria-selected={isActive}
              role="tab"
              tabIndex={isActive ? 0 : -1}
              className={`pb-3 px-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 ${
                isActive
                  ? "text-gold underline underline-offset-8 decoration-gold decoration-2"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {item.label}
            </button>
          );
        }

        // Bordered variant (for assets page style)
        return (
          <button
            key={item.value}
            onClick={() => onChange(item.value)}
            aria-selected={isActive}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            className={`text-xs font-semibold uppercase tracking-widest pb-px transition-colors focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 ${
              isActive
                ? "text-gold border-b-2 border-gold"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
