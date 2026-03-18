import { Chat } from '@/components/Chat';

interface ChatPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const { q } = await searchParams;
  return <Chat initialQuery={q} />;
}
