import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react';
import { allowedScopes } from '../domain/consent';
import { buildRecommendations } from '../domain/recommendations';
import type { CustomerData, Recommendation, Scope } from '../domain/types';
import { customerData, initialState, loadState, reducer, saveState, type Action, type AppState } from './appState';

interface Ctx {
  state: AppState;
  dispatch: Dispatch<Action>;
  data: CustomerData;
  recommendations: Recommendation[];
  allowed: Set<Scope>;
}

const AppContext = createContext<Ctx | null>(null);

export function AppProvider({ children, persist = true }: { children: ReactNode; persist?: boolean }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => (persist ? loadState() : null) ?? initialState());

  useEffect(() => {
    if (persist) saveState(state);
  }, [state, persist]);

  const data = useMemo(() => customerData(state), [state.personaId, state.demoDate, state.intentions, state.goals]);
  const recommendations = useMemo(
    () => buildRecommendations(state.store, state.feedback, state.demoDate),
    [state.store, state.feedback, state.demoDate],
  );
  const allowed = useMemo(() => allowedScopes(state.consent), [state.consent]);

  return <AppContext.Provider value={{ state, dispatch, data, recommendations, allowed }}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans AppProvider');
  return ctx;
}
