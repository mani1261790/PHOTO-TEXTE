import { EntryWizard } from '@/components/EntryWizard';

export default async function EntryPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EntryWizard id={id} />;
}
