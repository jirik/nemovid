import type { CadastralImport, VfkMetadata } from '../server/vfk';
import { useAppStore } from './store.ts';

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
