FROM python:3.12-slim-bookworm

RUN apt update && apt install -y curl nano

RUN curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
RUN chmod +x /usr/local/bin/dbmate

RUN pip install --upgrade pip
RUN pip install "fastapi[standard-no-fastapi-cloud-cli]" pydantic_settings "psycopg[binary,pool]" ruff pyright[nodejs]

RUN mkdir /app
WORKDIR /app
RUN chmod +777 /app
ENV PYTHONPATH="${PYTHONPATH}:/app"
