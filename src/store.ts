import type { Feature } from 'ol';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

interface State {
  fileName: string | null;
  features: Feature[];
}

interface Actions {
  fileOpened: ({
    name,
    features,
  }: { name: string; features: Feature[] }) => void;
}

export const useAppStore = create<State & Actions>()(
  immer((set) => ({
    fileName: null,
    features: [],
    fileOpened: ({ name, features }: { name: string; features: Feature[] }) =>
      set((state) => {
        state.fileName = name;
        state.features = features;
      }),
  })),
);
