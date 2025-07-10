FROM python:3.12-slim-bookworm

RUN apt update && apt install -y curl nano

RUN pip install --upgrade pip
RUN pip install "fastapi[standard-no-fastapi-cloud-cli]" pydantic_settings ruff pyright[nodejs]

RUN mkdir /app
WORKDIR /app
RUN chmod +777 /app
ENV PYTHONPATH="${PYTHONPATH}:/app"
