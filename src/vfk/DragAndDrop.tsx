import { Button } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';
import React from 'react';
import { getExtension } from '../filesystem.ts';
import classes from './DragAndDrop.module.css';

const filterByExtension = (files: File[], extensions: string[]) => {
  for (const extension of extensions) {
    console.assert(extension.startsWith('.'));
  }
  const lowerExtensions = extensions.map((e) => e.toLowerCase());
  return files.filter((file) => {
    const extension = getExtension(file.name);
    return lowerExtensions.includes(extension);
  });
};

const DragAndDrop = React.memo(
  ({
    onFilesSelected,
    supportedExtensions,
  }: {
    onFilesSelected: (files: File[]) => void;
    supportedExtensions: string[];
  }) => {
    const [files, setFiles] = useState<File[]>([]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        const newFiles = filterByExtension(
          Array.from(selectedFiles),
          supportedExtensions,
        );
        setFiles(newFiles);
      }
    };
    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const droppedFiles = event.dataTransfer.files;
      if (droppedFiles.length > 0) {
        const newFiles = filterByExtension(
          Array.from(droppedFiles),
          supportedExtensions,
        );
        setFiles(newFiles);
      }
    };

    useEffect(() => {
      onFilesSelected(files);
    }, [files, onFilesSelected]);

    const classNames = [classes.dragDrop];
    if (files.length > 0) {
      classNames.push(classes.active);
    }

    let content: ReactNode = null;
    if (files.length === 0) {
      content = (
        <>
          <p>Sem přetáhněte soubor(y)</p>
          <p>
            Podporované přípony:{' '}
            <strong>{supportedExtensions.join(', ')}</strong>
          </p>
          <input
            type="file"
            hidden
            id="browse"
            onChange={handleFileChange}
            accept={supportedExtensions.join(',')}
            multiple
          />
          <Button component="label" htmlFor="browse">
            Procházet soubory
          </Button>
        </>
      );
    } else {
      content = (
        <div className="success-file">
          <h3>Vybrané soubory</h3>
          <ul>
            {files.map((file) => {
              return <li key={file.name}>{file.name}</li>;
            })}
          </ul>
        </div>
      );
    }

    return (
      <div
        className={classNames.join(' ')}
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
      >
        {content}
      </div>
    );
  },
);

export default DragAndDrop;
