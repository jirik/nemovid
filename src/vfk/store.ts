import type { Draft } from 'immer';
import { createSelector } from 'reselect';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { assertIsDefined } from '../assert.ts';
import type { CadastralImport, VfkMetadata } from '../server/vfk';

export const DbImportStatus = {
  WAITING: 'WAITING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
} as const;

export type DbImportStatus = keyof typeof DbImportStatus;

export type VfkFileImport = {
  zoning_id: string;
  status: DbImportStatus;
};

export interface State {
  dbImports: CadastralImport[] | null;
  inputFileNames: string[] | null;
  vfkFilesMetadata: VfkMetadata[] | null;
  vfkFileImports: VfkFileImport[];
  zoningNames: { [zoningId: string]: string };
}

const initialState: State = {
  dbImports: null,
  inputFileNames: null,
  vfkFilesMetadata: null,
  vfkFileImports: [],
  zoningNames: {},
};

type Setter = {
  set: (setter: (state: Draft<State>) => void) => void;
};

export const useAppStore = create<State & Setter>()(
  immer((set) => ({ ...initialState, set: (state) => set(state) })),
);

const createAppSelector = createSelector.withTypes<State>();

export const getAllZoningNames = createAppSelector(
  [(state) => state.dbImports, (state) => state.zoningNames],
  (imports, zoningNames) => {
    const result: { [zoningId: string]: string } = {
      ...zoningNames,
    };
    for (const dbImport of imports || []) {
      result[dbImport.zoning_id] = dbImport.zoning_name;
    }
    return result;
  },
);

type ZoningTableRow = {
  zoning_id: string;
  zoning_name: string | null;
  db_valid_date: string | null;
  new_valid_date: string | null;
  vfk_import_status: DbImportStatus | null;
};

export const getSafeVfkFiles = createAppSelector(
  [(state) => state.vfkFilesMetadata],
  (vfkFilesMetadata) => {
    if (vfkFilesMetadata == null) {
      return null;
    }
    return vfkFilesMetadata.filter(
      (md) =>
        md.problems.length === 0 &&
        md.valid_date != null &&
        md.zoning_id != null,
    );
  },
);

export const getZoningTableRows = createAppSelector(
  [
    (state) => state.dbImports,
    (state) => state.zoningNames,
    getSafeVfkFiles,
    (state) => state.vfkFileImports,
  ],
  (imports, zoningNames, vfkFilesMetadata, vfkFileImports) => {
    if (imports == null && vfkFilesMetadata == null) {
      return null;
    }
    const result: ZoningTableRow[] = (imports || []).map((dbImport) => ({
      zoning_id: dbImport.zoning_id,
      zoning_name: dbImport.zoning_name,
      db_valid_date: dbImport.valid_date,
      new_valid_date: null,
      vfk_import_status: null,
    }));
    for (const md of vfkFilesMetadata || []) {
      assertIsDefined(md.zoning_id);
      assertIsDefined(md.valid_date);
      let row: ZoningTableRow | undefined = result.find(
        (r) => r.zoning_id === md.zoning_id,
      );
      const vfkImport = vfkFileImports.find(
        (vi) => vi.zoning_id === md.zoning_id,
      );
      if (!row) {
        row = {
          zoning_id: md.zoning_id,
          zoning_name: zoningNames[md.zoning_id] || null,
          db_valid_date: null,
          new_valid_date: md.valid_date,
          vfk_import_status: vfkImport?.status || null,
        };
        result.push(row);
      } else {
        row.new_valid_date = md.valid_date;
        row.vfk_import_status = vfkImport?.status || null;
      }
      if (row.vfk_import_status === DbImportStatus.SUCCESS) {
        row.db_valid_date = row.new_valid_date;
      }
    }
    return result;
  },
);

export const getIsAnySafeVfkFileAvailable = createAppSelector(
  [getSafeVfkFiles],
  (vfkFilesMetadata) => {
    return (vfkFilesMetadata || []).length > 0;
  },
);

export const getNewerVfkFiles = createAppSelector(
  [getSafeVfkFiles, getZoningTableRows],
  (vfkFilesMetadata, tableRows) => {
    return (vfkFilesMetadata || []).filter((md) => {
      const row = (tableRows || []).find(
        (row) => row.zoning_id === md.zoning_id,
      );
      assertIsDefined(row);
      assertIsDefined(row.new_valid_date);
      return (
        row.db_valid_date == null || row.db_valid_date < row.new_valid_date
      );
    });
  },
);

export const getIsImportIntoDbActive = createAppSelector(
  [(state) => state.vfkFileImports],
  (vfkFileImports) => {
    return vfkFileImports.length > 0;
  },
);

export const getImportProgress = createAppSelector(
  [(state) => state.vfkFileImports],
  (vfkFileImports) => {
    const activeImports = vfkFileImports.filter((vi) => vi.status != null);
    if (!activeImports) {
      return 0;
    }
    const finishedImports = activeImports.filter(
      (vi) =>
        vi.status === DbImportStatus.SUCCESS ||
        vi.status === DbImportStatus.FAILURE,
    );
    return Math.round((finishedImports.length / activeImports.length) * 100);
  },
);
