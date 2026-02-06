import { notFound } from '@/lib/api/errors';
import { Entry } from '@/lib/types';

interface ClientLike {
  from: (table: string) => {
    select: (columns?: string) => any;
  };
}

export async function getEntryById(
  client: ClientLike,
  id: string
): Promise<Entry> {
  const { data, error } = await client.from('entries').select('*').eq('id', id).single();
  if (error || !data) {
    notFound('ENTRY_NOT_FOUND', 'Entry not found');
  }
  return data as Entry;
}
