import { redirect } from "next/navigation";
import SeasonBoard from "@/components/SeasonBoard";
import SeasonEventGrid from "@/components/SeasonEventGrid";
import { getAuthenticatedEntrant } from "@/lib/draftAuth";

type Props = {
  params: Promise<{ year: string }>;
};

export default async function SeasonPage({ params }: Props) {
  const { year } = await params;
  const yearNum = Number(year);

  const session = await getAuthenticatedEntrant();
  if (!session) redirect(`/sign-in?returnTo=/season/${year}`);

  return (
    <main>
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-[0.28em] text-muted">The Ultimate Sports Decathlon</div>
        <h1 className="text-2xl font-semibold text-info">{yearNum} Season</h1>
        <p className="mt-1 text-sm text-muted">
          Every event counts. Finish 1st-6th per event, base points (10/7/5/3/1/0) times a tier multiplier,
          plus bonus awards. No cap.
        </p>
      </div>
      <div className="space-y-6">
        <SeasonBoard year={yearNum} />
        <SeasonEventGrid year={yearNum} />
      </div>
    </main>
  );
}
