ogr2ogr-bash:
	docker compose run --rm ogr2ogr bash -c 'source .venv/bin/activate && bash'

ogr2ogr-bash-root:
	docker compose run --rm -u root ogr2ogr bash -c 'source .venv/bin/activate && bash'

ogr2ogr-build:
	docker compose build ogr2ogr

ogr2ogr-up:
	docker compose up -d ogr2ogr

ogr2ogr-format:
	docker compose run --rm ogr2ogr bash -c "source .venv/bin/activate && ruff format ./src && ruff check --fix ./src"

ogr2ogr-check:
	docker compose run --rm ogr2ogr bash -c "source .venv/bin/activate && ruff format --check ./src && ruff check ./src && pyright ./src"

files-bash:
	docker compose run --rm files bash

files-bash-exec:
	docker compose exec files bash

files-bash-root:
	docker compose run --rm -u root files bash

files-build:
	docker compose build files

files-up:
	docker compose up -d files

files-format:
	docker compose run --rm files bash -c "ruff format && ruff check --fix"

files-check:
	docker compose run --rm files bash -c "ruff format --check && ruff check && pyright"

qgis-bash:
	docker compose run --rm qgis bash -c 'source .venv/bin/activate && bash'

qgis-bash-root:
	docker compose run --rm -u root qgis bash -c 'source .venv/bin/activate && bash'

qgis-build:
	docker compose build qgis

qgis-up:
	docker compose up -d qgis

qgis-format:
	docker compose run --rm qgis bash -c "source .venv/bin/activate && ruff format ./src && ruff check --fix ./src"

qgis-check:
	docker compose run --rm qgis bash -c "source .venv/bin/activate && ruff format --check ./src && ruff check ./src && pyright ./src"

format:
	$(MAKE) files-format
	$(MAKE) ogr2ogr-format
	$(MAKE) qgis-format
	npm run format

check:
	$(MAKE) files-check
	$(MAKE) ogr2ogr-check
	$(MAKE) qgis-check
	npm run check

dev:
	docker compose up -d files ogr2ogr qgis
	npm run dev

stop:
	docker compose stop

generate-typescript:
	npx @hey-api/openapi-ts -i http://localhost:8000/openapi.json -o src/server/files/
	npx @hey-api/openapi-ts -i http://localhost:8001/openapi.json -o src/server/ogr2ogr/
	npx @hey-api/openapi-ts -i http://localhost:8002/openapi.json -o src/server/qgis/
