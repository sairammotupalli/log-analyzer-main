import { AnalysisView } from '@/components/dashboard/AnalysisView';

// Next.js 16 App Router: params is a Promise
export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AnalysisView uploadId={id} />;
}
