import { DesignListTemplate } from "@/components/templates/DesignListTemplate";
import { DEFAULT_VIEW_OPTIONS } from "@/domain/viewOptions";
import { designRepository } from "@/server/designRepository";
import { settingsRepository } from "@/server/settingsRepository";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <DesignListTemplate
      initial={designRepository.list()}
      viewOptions={settingsRepository.getViewOptions() ?? DEFAULT_VIEW_OPTIONS}
    />
  );
}
