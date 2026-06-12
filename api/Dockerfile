FROM python:3.11-slim

WORKDIR /app

# System deps: build tools, AutoDock Vina, Open Babel, fpocket (built from source)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    autodock-vina \
    openbabel \
    libopenbabel-dev \
    git \
    cmake \
    build-essential \
    libnetcdf-dev \
    && rm -rf /var/lib/apt/lists/*

# fpocket not in apt — build from source (suppress GCC 14 incompatible-pointer-types error)
RUN git clone --depth 1 https://github.com/Discngine/fpocket.git /tmp/fpocket \
    && cd /tmp/fpocket \
    && sed -i 's/-Wstrict-prototypes/-Wstrict-prototypes -Wno-incompatible-pointer-types -Wno-error/g' makefile \
    && make \
    && make install \
    && rm -rf /tmp/fpocket

RUN pip install --no-cache-dir --prefer-binary \
    boto3 \
    "numpy>=1.24.0,<2.0" \
    "pandas>=2.0.0" \
    "scikit-learn>=1.3.0"

RUN pip install --no-cache-dir --prefer-binary rdkit-pypi

RUN pip install --no-cache-dir meeko biopython requests

RUN pip install --no-cache-dir fastapi "uvicorn[standard]" python-multipart

COPY src/ /app/src/
COPY models/ /app/models/
COPY scripts/ /app/scripts/
COPY main.py /app/main.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
