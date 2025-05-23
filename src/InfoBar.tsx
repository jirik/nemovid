import styles from './InfoBar.module.css';
import { type Zoning, getParcelsByZoning, useAppStore } from './store.ts';

const ZoningSection = ({ zoning }: { zoning: Zoning }) => {
  return (
    <div className={styles.section}>
      <h3>Katastrální území {zoning.title}</h3>
      <div>Celkem parcel: {Object.values(zoning.parcels).length}</div>
      <ul>
        {zoning.parcels.map((parcel) => {
          const parcelId = parcel.getId() as string;
          const parcelLabel = parcel.get('label') as string;
          return <li key={parcelId}>č. p. {parcelLabel}</li>;
        })}
      </ul>
    </div>
  );
};

const ParcelsSection = () => {
  const parcels = useAppStore((state) => state.parcels);
  const parcelsByZoning = useAppStore(getParcelsByZoning);
  return (
    <>
      <div className={styles.section}>
        <h3>Dotčené parcely</h3>
        <div>
          {parcels == null
            ? 'Načítá se ...'
            : `Celkem parcel: ${Object.values(parcels).length}`}
        </div>
      </div>
      {Object.values(parcelsByZoning).map((zoning) => {
        return <ZoningSection key={zoning.id} zoning={zoning} />;
      })}
    </>
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
