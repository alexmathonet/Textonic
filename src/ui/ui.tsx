import { createContext, useContext } from 'react';
import type { DetectorId, IntentionType } from '../domain/types';

export type Page = 'accueil' | 'personnalisation' | 'projets' | 'documents' | 'conseiller' | 'demo' | 'evaluation';

export const PAGES: { id: Page; label: string; icon: string }[] = [
  { id: 'accueil', label: 'Accueil', icon: 'home' },
  { id: 'personnalisation', label: 'Mon niveau de personnalisation', icon: 'sliders' },
  { id: 'projets', label: 'Mes projets', icon: 'target' },
  { id: 'documents', label: 'Mes documents', icon: 'folder' },
  { id: 'conseiller', label: 'Espace conseiller', icon: 'briefcase' },
  { id: 'demo', label: 'Mode démo', icon: 'play' },
  { id: 'evaluation', label: 'Évaluation', icon: 'chart' },
];

export interface UiCtx {
  page: Page;
  navigate: (p: Page) => void;
  explain: DetectorId | null;
  openExplanation: (id: DetectorId | null) => void;
  /** Type d'intention présélectionné dans le formulaire de « Mes projets ». */
  intentPreset: IntentionType | null;
  setIntentPreset: (t: IntentionType | null) => void;
}

export const UiContext = createContext<UiCtx | null>(null);

export function useUi(): UiCtx {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi doit être utilisé dans UiContext');
  return ctx;
}
