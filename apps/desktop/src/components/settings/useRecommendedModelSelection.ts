/**
 * Preselect recommended models on a new AI service (D625).
 *
 * The add form used to open with nothing chosen, so saving a key was never
 * enough: every user had to find a chat model in a list of dozens. This hook
 * fills the empty selection from `recommendModels` as soon as a trustworthy
 * list arrives, and steps aside for good the first time the user changes the
 * selection themselves. Until then a service change drops the previous picks,
 * so a list meant for one vendor never rides along to the next.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelBinding } from "@pi-desktop/shared";
import { canRecommendFrom, recommendModels } from "./recommended-models";
import type { ProviderModelsState } from "./useProviderModels";

type SetModels = (update: (current: ModelBinding[]) => ModelBinding[]) => void;

export type RecommendedModelSelection = {
  /** The setter every user-driven edit goes through; it ends preselection. */
  setModels: SetModels;
  /** True while the chosen list is exactly what the recommendation picked. */
  autoPicked: boolean;
  /** A trustworthy list arrived but held no chat model that can call tools. */
  noRecommendation: boolean;
};

/** Add a service-specific display label without replacing any binding label. */
export function labelFirstRecommendation(
  picks: ModelBinding[],
  alias?: string,
): ModelBinding[] {
  if (!alias || picks.length === 0 || picks[0].alias !== undefined) return picks;
  return [{ ...picks[0], alias }, ...picks.slice(1)];
}

export function useRecommendedModelSelection({
  enabled,
  serviceKey,
  discovery,
  setModels: setModelsState,
  namedService,
  defaultFirstModelAlias,
}: {
  /** Only a new service with an empty selection is preselected. */
  enabled: boolean;
  /** Service, endpoint and API format; a change restarts preselection. */
  serviceKey: string;
  discovery: ProviderModelsState;
  setModels: (next: ModelBinding[] | ((current: ModelBinding[]) => ModelBinding[])) => void;
  namedService: boolean;
  /** Optional display label applied only to a newly recommended first row. */
  defaultFirstModelAlias?: string;
}): RecommendedModelSelection {
  const touchedRef = useRef(false);
  const serviceKeyRef = useRef(serviceKey);
  const [autoPicked, setAutoPicked] = useState(false);
  const [noRecommendation, setNoRecommendation] = useState(false);

  const setModels = useCallback<SetModels>(
    (update) => {
      touchedRef.current = true;
      setAutoPicked(false);
      setNoRecommendation(false);
      setModelsState(update);
    },
    [setModelsState],
  );

  useEffect(() => {
    if (serviceKeyRef.current === serviceKey) return;
    serviceKeyRef.current = serviceKey;
    if (!enabled || touchedRef.current) return;
    setModelsState([]);
    setAutoPicked(false);
    setNoRecommendation(false);
  }, [enabled, serviceKey, setModelsState]);

  const recommendable = canRecommendFrom(discovery, namedService);
  useEffect(() => {
    // A later failure (say a mistyped key after a good one) keeps the picks:
    // they came from a list the service did answer with.
    if (!enabled || touchedRef.current || !recommendable) return;
    const picks = labelFirstRecommendation(
      recommendModels(discovery.models),
      defaultFirstModelAlias,
    );
    setModelsState(picks);
    setAutoPicked(picks.length > 0);
    setNoRecommendation(picks.length === 0);
  }, [defaultFirstModelAlias, discovery.models, enabled, recommendable, setModelsState]);

  return { setModels, autoPicked, noRecommendation };
}
