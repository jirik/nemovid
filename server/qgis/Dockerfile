FROM qgis/qgis:3.40-noble

# https://stackoverflow.com/questions/20635472/using-the-run-instruction-in-a-dockerfile-with-source-does-not-work
SHELL ["/bin/bash", "-c"]

RUN apt update && apt install -y curl nano

# we install venv because otherwise it's difficult to install other deps (e.g. pydantic_settings) together with osgeo
RUN mkdir /app
WORKDIR /app
RUN chmod +777 /app
ENV PYTHONPATH="${PYTHONPATH}:/app"
RUN python3 -m venv --system-site-packages .venv
RUN source .venv/bin/activate && pip install "fastapi[standard-no-fastapi-cloud-cli]" pydantic_settings ruff pyright[nodejs]
