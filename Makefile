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

format:
	$(MAKE) files-format
	$(MAKE) ogr2ogr-format
	npm run format

check:
	$(MAKE) files-check
	$(MAKE) ogr2ogr-check
	npm run check

dev:
	docker compose up -d files ogr2ogr
	npm run dev

stop:
	docker compose stop
