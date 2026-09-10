type InterviewBerufPageProps = {
  params: Promise<{ berufId: string }>;
};

export default async function InterviewBerufPage({
  params,
}: InterviewBerufPageProps) {
  const { berufId } = await params;

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-space-16">
      <p className="font-body-md text-body-md text-on-surface-variant">
        Interview · {berufId}
      </p>
    </main>
  );
}
