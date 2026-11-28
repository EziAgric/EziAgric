import MediatorPanelClient from "./MediatorPanelClient";
import { ResolutionForm } from "./ResolutionForm";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <MediatorPanelClient disputeId={id} />
      <ResolutionForm disputeId={id} />
    </div>
  );
}
