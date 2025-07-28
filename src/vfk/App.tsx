import '@mantine/core/styles.css';
import './App.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { postFiles } from '../server/files';
import { createClient as createFilesClient } from '../server/files/client';
import settings from '../settings.ts';
import DragAndDrop from './DragAndDrop.tsx';

const theme = createTheme({
  /** Put your mantine theme override here */
});

const App = () => {
  return (
    <MantineProvider theme={theme}>
      <main>
        <div>
          <h1>Nahrávání souborů z katastru nemovitostí</h1>
          <DragAndDrop
            onFilesSelected={async (files: File[]) => {
              if (!files.length) {
                return;
              }
              console.log('files selected', files);
              const filesClient = createFilesClient({
                baseUrl: settings.publicUrl,
              });
              const vfkResp = await postFiles({
                body: { files },
                query: { label: 'vfk' },
                client: filesClient,
              });
              console.log('vfkResp', vfkResp);
            }}
            supportedExtensions={['.zip']}
          />
        </div>
      </main>
    </MantineProvider>
  );
};

export default App;
