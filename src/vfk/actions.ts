import type { CadastralImport, VfkMetadata } from '../server/vfk';
import { type VfkFileImport, useAppStore } from './store.ts';

const set = useAppStore.getState().set;

export const dbImportsLoaded = ({
  dbImports,
}: { dbImports: CadastralImport[] }) =>
  set((state) => {
    state.dbImports = dbImports;
  });

export const filesOpened = ({ names }: { names: string[] }) =>
  set((state) => {
    state.inputFileNames = names;
  });

export const vfkFilesExtracted = ({ metadata }: { metadata: VfkMetadata[] }) =>
  set((state) => {
    state.vfkFilesMetadata = metadata;
  });

export const zoningNamesLoaded = ({
  names,
}: { names: { [zoningId: string]: string } }) =>
  set((state) => {
    state.zoningNames = {
      ...state.zoningNames,
      ...names,
    };
  });

export const vfkFileImportStatusChange = ({
  vfkImport,
}: { vfkImport: VfkFileImport }) =>
  set((state) => {
    const oldVfkImport = state.vfkFileImports.find(
      (vi) => vi.zoning_id === vfkImport.zoning_id,
    );
    if (oldVfkImport) {
      oldVfkImport.status = vfkImport.status;
    } else {
      state.vfkFileImports.push(structuredClone(vfkImport));
    }
    console.log(vfkImport.zoning_id, vfkImport.status);
  });
