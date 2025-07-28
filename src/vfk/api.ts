import { assertIsDefined } from '../assert.ts';
import { getExtension } from '../filesystem.ts';
import {
  type ListedFile,
  listDirectoryFiles,
  unzipFiles,
} from '../server/files';
import { createClient as createFilesClient } from '../server/files/client';
import settings from '../settings.ts';

type FileUrl = {
  url: string;
  archivedPath?: string | null;
};

const filesClient = createFilesClient({
  baseUrl: settings.publicUrl,
});

const getFileList = async (directoryName: string): Promise<ListedFile[]> => {
  const listFilesResp = await listDirectoryFiles({
    path: {
      directory_name: directoryName,
    },
    client: filesClient,
  });
  assertIsDefined(listFilesResp.data);
  return listFilesResp.data;
};

const getFilesByExtension = (
  listedFiles: ListedFile[],
  extension: string,
): ListedFile[] => {
  return listedFiles.filter((item) => {
    const ext = getExtension(item.filename);
    return ext === extension;
  });
};

const getArchivedFilesByExtension = (
  listedFiles: ListedFile[],
  extension: string,
): FileUrl[] => {
  return getFilesByExtension(listedFiles, '.zip').reduce(
    (prev: FileUrl[], item) => {
      for (const archivedPath of item.archived_file_paths || []) {
        const archivedExt = getExtension(archivedPath);
        if (archivedExt === extension) {
          prev.push({ url: item.url, archivedPath: archivedPath });
        }
      }
      return prev;
    },
    [],
  );
};

const getVfkFilesFromList = (listedFiles: ListedFile[]): FileUrl[] => {
  const vfkFiles: FileUrl[] = getFilesByExtension(listedFiles, '.vfk').map(
    (item) => ({ url: item.url }),
  );

  const archivedVfkFiles = getArchivedFilesByExtension(listedFiles, '.vfk');

  return vfkFiles.concat(archivedVfkFiles);
};

export const extractVfkFiles = async (directoryName: string) => {
  const listedFiles = await getFileList(directoryName);

  let vfkFiles: FileUrl[] = getVfkFilesFromList(listedFiles);

  if (vfkFiles.length === 0) {
    const zipFiles = getArchivedFilesByExtension(listedFiles, '.zip');
    const unzippedFiles = await unzipFiles({
      body: zipFiles.map((f) => ({
        url: f.url,
        archived_file_path: f.archivedPath || '',
      })),
      client: filesClient,
    });
    if (unzippedFiles.data?.length) {
      const listedFiles = await getFileList(directoryName);
      vfkFiles = getVfkFilesFromList(listedFiles);
    }
  }

  return vfkFiles;
};
