import '@mantine/core/styles.css';
import './App.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { assertIsDefined } from '../assert.ts';
import { postFiles } from '../server/files';
import { createClient as createFilesClient } from '../server/files/client';
import settings from '../settings.ts';
import DragAndDrop from './DragAndDrop.tsx';
import { extractVfkFiles } from './api.ts';

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
              const uploadResp = await postFiles({
                body: { files },
                query: { label: 'vfk' },
                client: filesClient,
              });
              console.log('uploadResp', uploadResp);
              assertIsDefined(uploadResp.data);
              const dirname = uploadResp.data.dirname;

              const vfkFiles = await extractVfkFiles(dirname);
              console.log('vfkFiles', vfkFiles);
            }}
            supportedExtensions={['.zip']}
          />
        </div>
      </main>
    </MantineProvider>
  );
};

export default App;
