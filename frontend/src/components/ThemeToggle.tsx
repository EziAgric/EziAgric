"use client";

import { useTheme } from "@/hooks/useTheme";

/**
 * Theme toggle with three modes: System (auto), Light, Dark.
 * Renders as a segmented control matching the settings page design language.
 */
export function ThemeToggle() {
  const { themePreference, setTheme } = useTheme();

  const options: { value: "system" | "light" | "dark"; label: string; icon: string }[] = [
    { value: "system", label: "System", icon: "💻" },
    { value: "light", label: "Light", icon: "☀️" },
    { value: "dark", label: "Dark", icon: "🌙" },
  ];

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border-default bg-surface-2 p-1" role="radiogroup" aria-label="Theme preference">
      {options.map((opt) => {
        const isActive = themePreference === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(opt.value)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-gold text-text-inverse shadow-sm"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-1"
            }`}
          >
            <span aria-hidden="true">{opt.icon}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
