import type { Draft } from 'immer';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { CadastralImport, VfkMetadata } from '../server/vfk';

export interface State {
  dbImports: CadastralImport[] | null;
  inputFileNames: string[] | null;
  vfkFilesMetadata: VfkMetadata[] | null;
}

const initialState: State = {
  dbImports: null,
  inputFileNames: null,
  vfkFilesMetadata: null,
};

type Setter = {
  set: (setter: (state: Draft<State>) => void) => void;
};

export const useAppStore = create<State & Setter>()(
  immer((set) => ({ ...initialState, set: (state) => set(state) })),
);

const createAppSelector = createSelector.withTypes<State>();

export const getAllZoningNames = createAppSelector(
  [(state) => state.dbImports],
  (imports) => {
    const result: { [zoningId: string]: string } = {};
    for (const dbImport of imports || []) {
      result[dbImport.zoning_id] = dbImport.zoning_name;
    }
    return result;
  },
);
