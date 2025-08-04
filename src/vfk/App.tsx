import '@mantine/core/styles.css';
import './../global.css';
import './App.css';
import { Container, MantineProvider, Table, createTheme } from '@mantine/core';
import { useCallback, useEffect } from 'react';
import { assertIsDefined } from '../assert.ts';
import { postFiles } from '../server/files';
import { createClient as createFilesClient } from '../server/files/client';
import { getFilesMetadata, listDbImports } from '../server/vfk';
import settings from '../settings.ts';
import styles from './App.module.css';
import DragAndDrop from './DragAndDrop.tsx';
import { dbImportsLoaded, filesOpened, vfkFilesExtracted } from './actions.ts';
import { extractVfkFiles } from './api.ts';
import { getAllZoningNames, useAppStore } from './store.ts';

const theme = createTheme({});

const filesClient = createFilesClient({
  baseUrl: settings.publicUrl,
});

const vfkClient = createFilesClient({
  baseUrl: settings.publicUrl,
});

const App = () => {
  const dbImports = useAppStore((state) => state.dbImports);
  const inputFileNames = useAppStore((state) => state.inputFileNames);
  const vfkFilesMetadata = useAppStore((state) => state.vfkFilesMetadata);
  const allZoningNames = useAppStore(getAllZoningNames);

  useEffect(() => {
    (async () => {
      const dbImportsResp = await listDbImports({ client: vfkClient });
      assertIsDefined(dbImportsResp.data);
      dbImportsLoaded({ dbImports: dbImportsResp.data });
    })();
  }, []);

  let dbImportsJsx: React.ReactNode;
  if (dbImports) {
    if (dbImports.length > 0) {
      dbImportsJsx = (
        <Table className={styles.table}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kód KÚ</Table.Th>
              <Table.Th>Název KÚ</Table.Th>
              <Table.Th>Datum platnosti</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {dbImports.map((vfkImport) => (
              <Table.Tr key={vfkImport.zoning_id}>
                <Table.Td>{vfkImport.zoning_id}</Table.Td>
                <Table.Td>{vfkImport.zoning_name}</Table.Td>
                <Table.Td>{vfkImport.valid_date}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      );
    } else {
      dbImportsJsx = <p>Dosud nebyla nahrána žádná data.</p>;
    }
  } else {
    dbImportsJsx = <p>Zjišťuji informace z databáze</p>;
  }

  const onFilesSelected = useCallback((files: File[]) => {
    (async () => {
      if (!files.length) {
        return;
      }
      const fileNames = files.map((file) => file.name);
      filesOpened({ names: fileNames });
      const uploadResp = await postFiles({
        body: { files },
        query: { label: 'vfk' },
        client: filesClient,
      });
      assertIsDefined(uploadResp.data);
      const dirname = uploadResp.data.dirname;

      const vfkFiles = await extractVfkFiles(dirname);

      const vfkMetadataResp = await getFilesMetadata({
        body: vfkFiles.map((vfkFile) => ({
          url: vfkFile.url,
          archived_file_path: vfkFile.archivedPath || null,
        })),
        client: vfkClient,
      });
      assertIsDefined(vfkMetadataResp.data);
      const vfkFilesMetadata = vfkMetadataResp.data;
      vfkFilesExtracted({ metadata: vfkFilesMetadata });
    })();
  }, []);

  const inputFilesJsx: React.ReactNode =
    inputFileNames === null ? (
      <DragAndDrop
        onFilesSelected={onFilesSelected}
        supportedExtensions={['.zip']}
      />
    ) : (
      <div>
        Vstupní soubory
        <ul>
          {inputFileNames.map((fn) => (
            <li key={fn}>{fn}</li>
          ))}
        </ul>
        {vfkFilesMetadata === null ? <p>Ukládám vstupní soubory</p> : null}
      </div>
    );

  const vfkFilesJsx: React.ReactNode =
    vfkFilesMetadata === null ? null : (
      <div>
        Nalezená data z katastru nemovitostí
        <Table className={styles.table}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kód KÚ</Table.Th>
              <Table.Th>Název KÚ</Table.Th>
              <Table.Th>Datum platnosti</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {vfkFilesMetadata.map((md) => {
              const key = [md.file.url, md.file.archived_file_path].join('//');
              return (
                <Table.Tr key={key}>
                  <Table.Td>{md.zoning_id}</Table.Td>
                  <Table.Td>
                    {allZoningNames[md.zoning_id || ''] || '?'}
                  </Table.Td>
                  <Table.Td>{md.valid_date}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    );

  return (
    <MantineProvider theme={theme}>
      <main>
        <Container className={styles.container}>
          <h1>Importování dat z katastru nemovitostí</h1>
          <div className={styles.section}>
            <h2>Import nových dat</h2>
            {inputFilesJsx}
            {vfkFilesJsx}
          </div>
          <div className={styles.section}>
            <h2>Existující data</h2>
            {dbImportsJsx}
          </div>
        </Container>
      </main>
    </MantineProvider>
  );
};

export default App;
