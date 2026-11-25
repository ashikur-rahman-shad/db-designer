import { notFound } from "next/navigation";
import { EditorTemplate } from "@/components/templates/EditorTemplate";
import type { Design } from "@/domain/types";
import { designRepository } from "@/server/designRepository";
import { settingsRepository } from "@/server/settingsRepository";
import { versionRepository } from "@/server/versionRepository";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
};

export default async function EditorPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { version } = await searchParams;
  const design = designRepository.get(id);
  if (!design) notFound();
  const versionInfo = versionRepository.info(id);
  const viewOptions = settingsRepository.getViewOptions();

  // /designs/:id?version=N opens that saved version, read-only.
  if (version !== undefined) {
    const n = Number(version);
    const v = Number.isInteger(n) ? versionRepository.get(id, n) : null;
    if (!v) notFound();
    const shown: Design = {
      ...design,
      name: v.name,
      shortDescription: v.shortDescription,
      longDescription: v.longDescription,
      data: v.data,
    };
    return (
      <EditorTemplate
        key={`${id}:v${n}`}
        design={shown}
        versionInfo={versionInfo}
        viewOptions={viewOptions}
        viewing={{ version: n, createdAt: v.createdAt, note: v.note }}
      />
    );
  }
  return <EditorTemplate key={`${id}:latest`} design={design} versionInfo={versionInfo} viewOptions={viewOptions} />;
}
