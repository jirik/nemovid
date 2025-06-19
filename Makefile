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

files-check:
	docker compose run --rm files bash -c "cd /app && ruff format --check && ruff check && pyright"

files-format:
	docker compose run --rm files bash -c "cd /app && ruff format && ruff check --fix"

format:
	$(MAKE) files-format
	npm run format

check:
	$(MAKE) files-check
	npm run check

dev:
	$(MAKE) files-up
	npm run dev

stop:
	docker compose stop
