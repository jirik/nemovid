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

files-migrate:
	docker compose run --rm files bash -c "dbmate status && dbmate migrate"

files-up:
	docker compose up -d files

files-format:
	docker compose run --rm files bash -c "ruff format && ruff check --fix"

files-check:
	docker compose run --rm files bash -c "ruff format --check && ruff check && pyright"

vfk-bash:
	docker compose run --rm vfk bash

vfk-bash-exec:
	docker compose exec vfk bash

vfk-bash-root:
	docker compose run --rm -u root vfk bash

vfk-build:
	docker compose build vfk

vfk-migrate:
	docker compose run --rm vfk bash -c "dbmate status && dbmate migrate"

vfk-up:
	docker compose up -d vfk

vfk-format:
	docker compose run --rm vfk bash -c "ruff format && ruff check --fix"

vfk-check:
	docker compose run --rm vfk bash -c "ruff format --check && ruff check && pyright"

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

postgres-ensure-data-dir:
	mkdir -p server/postgres/data

postgres-clear-data:
	docker stop postgres | true
	rm -rf server/postgres/data

postgres-bash:
	$(MAKE) postgres-ensure-data-dir
	docker compose run --rm postgres bash

postgres-bash-root:
	$(MAKE) postgres-ensure-data-dir
	docker compose run --rm -u root postgres bash

postgres-psql:
	$(MAKE) postgres-ensure-data-dir
	docker compose run --rm postgres bash -c "psql \$$DATABASE_URL"

postgres-dump-files-schema:
	$(MAKE) postgres-ensure-data-dir
	docker compose run --rm postgres bash -c "pg_dump \$$DATABASE_URL --schema-only --schema=files --exclude-table=files.schema_migrations > /app/files/db/schema.sql"

postgres-build:
	docker compose build postgres

postgres-up:
	$(MAKE) postgres-ensure-data-dir
	docker compose up -d postgres

server-up:
	docker compose up -d postgres files ogr2ogr qgis vfk

migrate:
	$(MAKE) files-migrate

format:
	$(MAKE) files-format
	$(MAKE) ogr2ogr-format
	$(MAKE) qgis-format
	$(MAKE) vfk-format
	npm run format

check:
	$(MAKE) files-check
	$(MAKE) ogr2ogr-check
	$(MAKE) qgis-check
	$(MAKE) vfk-check
	npm run check

dev:
	$(MAKE) server-up
	npm run dev

dev-headless:
	$(MAKE) server-up
	npm run dev-headless

stop:
	docker compose stop

generate-typescript:
	npx @hey-api/openapi-ts -i http://localhost:8000/openapi.json -o src/server/files/
	npx @hey-api/openapi-ts -i http://localhost:8001/openapi.json -o src/server/ogr2ogr/
	npx @hey-api/openapi-ts -i http://localhost:8002/openapi.json -o src/server/qgis/
	npx @hey-api/openapi-ts -i http://localhost:8003/openapi.json -o src/server/vfk/
