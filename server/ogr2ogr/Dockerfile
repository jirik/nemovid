FROM ghcr.io/osgeo/gdal:ubuntu-small-3.11.0

SHELL ["/bin/bash", "-c"]

RUN apt update && apt install -y curl nano

# we install venv because otherwise it's difficult to install other deps (e.g. pydantic_settings) together with osgeo
RUN apt install -y python3-venv
RUN mkdir /app
WORKDIR /app
RUN chmod +777 /app
ENV PYTHONPATH="${PYTHONPATH}:/app"
RUN python3 -m venv --system-site-packages .venv
RUN source .venv/bin/activate && pip install "fastapi[standard]" pydantic_settings ruff pyright[nodejs]
