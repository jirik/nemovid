import styles from './InfoBar.module.css';
import { useAppStore } from './store.ts';

const ParcelsSection = () => {
  const parcels = useAppStore((state) => state.parcels);
  return (
    <div className={styles.section}>
      <h3>Dotčené parcely</h3>
      <div>
        {parcels == null
          ? 'Načítá se ...'
          : `Celkem parcel: ${Object.values(parcels).length}`}
      </div>
    </div>
  );
};

const InfoBar = () => {
  const fileName = useAppStore((state) => state.fileName);

  return (
    <div id="infoBar" className={styles.container}>
      {!fileName ? (
        <div className={styles.section}>
          <h3>Vítejte</h3>
          <div>
            Začněte tím, že soubor *.geojson přetáhnete nad mapu (drag & drop).
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <h3>Zobrazený soubor</h3>
          <div>{fileName}</div>
        </div>
      )}
      {fileName ? <ParcelsSection /> : null}
    </div>
  );
};

export default InfoBar;
