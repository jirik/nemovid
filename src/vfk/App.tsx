import '@mantine/core/styles.css';
import './../global.css';
import './App.css';
import {
  Button,
  Container,
  Loader,
  MantineProvider,
  Progress,
  Table,
  createTheme,
} from '@mantine/core';
import { useCallback, useEffect } from 'react';
import { assertIsDefined } from '../assert.ts';
import { getZoningNames } from '../cuzk.ts';
import { postFiles } from '../server/files';
import { createClient as createFilesClient } from '../server/files/client';
import {
  type VfkMetadata,
  dbImport,
  getFilesMetadata,
  listDbImports,
} from '../server/vfk';
import settings from '../settings.ts';
import styles from './App.module.css';
import DragAndDrop from './DragAndDrop.tsx';
import {
  dbImportsLoaded,
  filesOpened,
  vfkFileImportStatusChange,
  vfkFilesExtracted,
  zoningNamesLoaded,
} from './actions.ts';
import { extractVfkFiles } from './api.ts';
import {
  DbImportStatus,
  type VfkFileImport,
  getAllZoningNames,
  getImportProgress,
  getIsAnySafeVfkFileAvailable,
  getIsImportIntoDbActive,
  getNewerVfkFiles,
  getSafeVfkFiles,
  getZoningTableRows,
  useAppStore,
} from './store.ts';

const theme = createTheme({});

const filesClient = createFilesClient({
  baseUrl: settings.publicUrl,
});

const vfkClient = createFilesClient({
  baseUrl: settings.publicUrl,
});

const importVfkFiles = async (vfkFiles: VfkMetadata[]) => {
  for (const vfkFile of vfkFiles || []) {
    assertIsDefined(vfkFile.zoning_id);
    const vfkImport: VfkFileImport = {
      zoning_id: vfkFile.zoning_id,
      status: DbImportStatus.WAITING,
    };
    vfkFileImportStatusChange({ vfkImport });
  }
  for (const vfkFile of vfkFiles || []) {
    assertIsDefined(vfkFile.zoning_id);
    const vfkImport: VfkFileImport = {
      zoning_id: vfkFile.zoning_id,
      status: DbImportStatus.RUNNING,
    };
    vfkFileImportStatusChange({ vfkImport });
    const dbImportResp = await dbImport({
      body: vfkFile.file,
      client: vfkClient,
    });
    vfkImport.status = dbImportResp.error
      ? DbImportStatus.FAILURE
      : DbImportStatus.SUCCESS;
    vfkFileImportStatusChange({ vfkImport });
  }
};

const App = () => {
  const inputFileNames = useAppStore((state) => state.inputFileNames);
  const vfkFilesMetadata = useAppStore((state) => state.vfkFilesMetadata);
  const safeVfkFiles = useAppStore(getSafeVfkFiles);
  const newerVfkFiles = useAppStore(getNewerVfkFiles);

  const allZoningNames = useAppStore(getAllZoningNames);
  const zoningTableRows = useAppStore(getZoningTableRows);
  const isAnySafeVfkFileAvailable = useAppStore(getIsAnySafeVfkFileAvailable);
  const isImportIntoDbActive = useAppStore(getIsImportIntoDbActive);
  const importProgress = useAppStore(getImportProgress);

  useEffect(() => {
    (async () => {
      const dbImportsResp = await listDbImports({ client: vfkClient });
      assertIsDefined(dbImportsResp.data);
      dbImportsLoaded({ dbImports: dbImportsResp.data });
    })();
  }, []);

  let dbImportsJsx: React.ReactNode;
  if (zoningTableRows) {
    if (zoningTableRows.length > 0) {
      dbImportsJsx = (
        <Table className={styles.table} stickyHeader>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Kód KÚ</Table.Th>
              <Table.Th>Název KÚ</Table.Th>
              <Table.Th>Aktuální datum platnosti</Table.Th>
              {isAnySafeVfkFileAvailable ? (
                <Table.Th>Platnost dat ze souboru</Table.Th>
              ) : null}
              {isImportIntoDbActive ? (
                <Table.Th>Průběh importu</Table.Th>
              ) : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {zoningTableRows.map((row) => {
              let newDataCell: React.ReactNode = null;
              if (isAnySafeVfkFileAvailable) {
                if (row.new_valid_date != null) {
                  newDataCell = <Table.Td>{row.new_valid_date}</Table.Td>;
                } else {
                  newDataCell = <Table.Td>data nenalezena</Table.Td>;
                }
              }
              let importStatusCell: React.ReactNode = null;
              if (isImportIntoDbActive) {
                if (row.vfk_import_status === DbImportStatus.FAILURE) {
                  importStatusCell = (
                    <Table.Td className={styles.warn}>Chyba!</Table.Td>
                  );
                } else if (row.vfk_import_status === DbImportStatus.WAITING) {
                  importStatusCell = <Table.Td>čeká ve frotě</Table.Td>;
                } else if (row.vfk_import_status === DbImportStatus.RUNNING) {
                  importStatusCell = (
                    <Table.Td>
                      <Loader color="blue" size={16} />
                    </Table.Td>
                  );
                } else if (row.vfk_import_status === DbImportStatus.SUCCESS) {
                  importStatusCell = (
                    <Table.Td className={styles.success}>
                      úspěšně dokončeno
                    </Table.Td>
                  );
                } else {
                  importStatusCell = <Table.Td>není co importovat</Table.Td>;
                }
              }
              return (
                <Table.Tr key={row.zoning_id}>
                  <Table.Td>{row.zoning_id}</Table.Td>
                  <Table.Td>{row.zoning_name || '?'}</Table.Td>
                  <Table.Td>{row.db_valid_date || 'dosud žádné'}</Table.Td>
                  {newDataCell}
                  {importStatusCell}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      );
    } else {
      dbImportsJsx = <p>Dosud nebyla nahrána žádná data.</p>;
    }
  } else {
    dbImportsJsx = <p>Zjišťuji informace z databáze</p>;
  }

  const onFilesSelected = useCallback(
    (files: File[]) => {
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

        const unknownZoningNames = vfkFilesMetadata
          .map((md) => md.zoning_id)
          .filter(
            (zoning_id) => zoning_id != null && !(zoning_id in allZoningNames),
          ) as string[];
        const zoningNames = await getZoningNames(unknownZoningNames);
        zoningNamesLoaded({ names: zoningNames });
      })();
    },
    [allZoningNames],
  );

  const onNewerDbImportClick = useCallback(() => {
    (async () => {
      await importVfkFiles(newerVfkFiles);
    })();
  }, [newerVfkFiles]);

  const onAllDbImportClick = useCallback(() => {
    (async () => {
      await importVfkFiles(safeVfkFiles || []);
    })();
  }, [safeVfkFiles]);

  let inputFilesJsx: React.ReactNode = null;
  if (inputFileNames === null) {
    inputFilesJsx = (
      <DragAndDrop
        onFilesSelected={onFilesSelected}
        supportedExtensions={['.zip']}
      />
    );
  } else {
    const vfkFilesJsx: React.ReactNode[] = [];
    if (vfkFilesMetadata === null) {
      vfkFilesJsx.push(<p key="savingInputFiles">Ukládám vstupní soubory</p>);
    } else {
      assertIsDefined(safeVfkFiles);
      vfkFilesJsx.push(
        ...[
          <div key="zoningCount">
            Počet katastrálních území: <strong>{safeVfkFiles.length}</strong>
          </div>,
          <div key="newerZoningCount">
            Počet katastrálních území s novějšími daty:{' '}
            <strong>{newerVfkFiles.length}</strong>
          </div>,
        ],
      );
      if (safeVfkFiles.length > 0) {
        if (isImportIntoDbActive) {
          vfkFilesJsx.push(
            <div key="importIntoDb">
              <strong>Průběh importu</strong>
              <Progress value={importProgress} />
            </div>,
          );
        } else {
          vfkFilesJsx.push(
            <div key="importIntoDb">
              <Button onClick={onAllDbImportClick}>
                Naimportovat do databáze všechna data
              </Button>
              {newerVfkFiles.length > 0 ? (
                <Button onClick={onNewerDbImportClick}>
                  Naimportovat do databáze novější data
                </Button>
              ) : null}
            </div>,
          );
        }
      }
    }
    inputFilesJsx = (
      <div>
        <strong>Vstupní soubory</strong>
        <ul>
          {inputFileNames.map((fn) => (
            <li key={fn}>{fn}</li>
          ))}
        </ul>
        {vfkFilesJsx}
      </div>
    );
  }

  return (
    <MantineProvider theme={theme}>
      <main>
        <Container className={styles.container}>
          <h1>Importování dat z katastru nemovitostí</h1>
          <div className={styles.section}>
            <h2>Import nových dat</h2>
            {inputFilesJsx}
          </div>
          <div className={styles.section}>
            <h2>Přehled dat</h2>
            {dbImportsJsx}
          </div>
        </Container>
      </main>
    </MantineProvider>
  );
};

export default App;
