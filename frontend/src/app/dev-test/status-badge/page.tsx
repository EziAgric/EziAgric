// src/app/dev/status-badges/page.tsx
// Smoke-test page — visit: http://localhost:3000/dev/status-badges

import { StatusBadge, TradeStatus } from "@/components/ui/StatusBadge";

const ALL_STATUSES: TradeStatus[] = [
  "delivered",
  "in-transit",
  "disputed",
  "locked",
  "draft",
  "pending",
];

export default function StatusBadgeDevPage() {
  return (
    <div className="min-h-screen bg-primary p-10">
      <h1 className="text-2xl font-bold text-gold mb-2">StatusBadge</h1>
      <p className="text-text-secondary text-sm mb-10">
        All 6 trade statuses · sizes sm &amp; md · icon on/off
      </p>

      {/* Size: md (default) */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest text-text-muted mb-4 uppercase">
          Size — md (default)
        </h2>
        <div className="flex flex-wrap gap-3">
          {ALL_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} size="md" />
          ))}
        </div>
      </section>

      {/* Size: sm */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest text-text-muted mb-4 uppercase">
          Size — sm
        </h2>
        <div className="flex flex-wrap gap-3">
          {ALL_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} size="sm" />
          ))}
        </div>
      </section>

      {/* showIcon=false → dot only */}
      <section className="mb-10">
        <h2 className="text-xs font-semibold tracking-widest text-text-muted mb-4 uppercase">
          showIcon=false (dot + label)
        </h2>
        <div className="flex flex-wrap gap-3">
          {ALL_STATUSES.map((s) => (
            <StatusBadge key={s} status={s} showIcon={false} />
          ))}
        </div>
      </section>

      {/* In-context: table row preview */}
      <section>
        <h2 className="text-xs font-semibold tracking-widest text-text-muted mb-4 uppercase">
          In-context — trade list row
        </h2>
        <div className="bg-card border border-border-default rounded-xl overflow-hidden divide-y divide-border-default">
          {[
            { id: "AMN-4920-X", commodity: "20T Non-GMO Soybeans", status: "in-transit" as TradeStatus },
            { id: "AMN-3811-Y", commodity: "50T White Maize", status: "delivered" as TradeStatus },
            { id: "AMN-2204-Z", commodity: "10T Cocoa Beans", status: "disputed" as TradeStatus },
            { id: "AMN-1107-A", commodity: "30T Cassava Flour", status: "locked" as TradeStatus },
            { id: "AMN-0990-B", commodity: "15T Palm Oil", status: "pending" as TradeStatus },
            { id: "AMN-0012-C", commodity: "8T Groundnuts", status: "draft" as TradeStatus },
          ].map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-elevated transition-colors"
            >
              <div>
                <p className="text-sm font-semibold text-text-primary">{row.commodity}</p>
                <p className="text-xs text-text-muted font-mono mt-0.5">{row.id}</p>
              </div>
              <StatusBadge status={row.status} size="sm" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
