FROM python:3.11-slim

WORKDIR /app

# System deps: AutoDock Vina, fpocket, Open Babel for structure prep
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    autodock-vina \
    fpocket \
    openbabel \
    libopenbabel-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --prefer-binary \
    boto3 \
    "numpy>=1.24.0,<2.0" \
    "pandas>=2.0.0" \
    "scikit-learn>=1.3.0"

RUN pip install --no-cache-dir --prefer-binary rdkit-pypi

RUN pip install --no-cache-dir meeko biopython requests

RUN pip install --no-cache-dir fastapi "uvicorn[standard]"

COPY src/ /app/src/
COPY models/ /app/models/
COPY scripts/ /app/scripts/
COPY main.py /app/main.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
