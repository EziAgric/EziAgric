"use client";

import { ForbiddenState } from "@/components/ui/ForbiddenState";

export default function AccessDeniedPage() {
  return (
    <div className="px-6 py-8 max-w-6xl mx-auto" data-testid="access-denied-page">
      <ForbiddenState
        title="Access Denied"
        message="You need an authenticated admin wallet to view this page."
      />
    </div>
  );
}
