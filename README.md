# Nemovid

Urban planning tool focused on finding parcels in the Czech Republic that intersects with planned construction (e.g. roads, buildings, etc.).

Following input files are supported:
- GeoJSON with polygon features in S-JTSK (EPSG:5514)
- DXF in S-JTSK (EPSG:5514), only hatch features are considered

## Requirements
- linux
- [docker](https://www.docker.com/)
- [git](https://git-scm.com/)
- [nvm](https://github.com/nvm-sh/nvm)

## Installation
```bash
# get the code
git clone git@github.com:jirik/nemovid.git
cd nemovid

# use default settings, or adjust it to your own needs
cp .env.default .env
cp src/settings/settings.default.ts src/settings/settings.ts 

# build backend docker images
make postgres-build
make files-build
make ogr2ogr-build
make qgis-build

# start database & run migrations
make postgres-up
make migrate

# start server containers
make server-up

# install correct Node.js version and Node.js dependencies
nvm install
npm ci

# generate typescript models from OpenAPI
make generate-typescript

# build client
npm run build
```

## Run
```bash
make server-up
npm run preview
```

## Development
```bash
make dev
```
