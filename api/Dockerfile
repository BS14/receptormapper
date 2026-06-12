FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir --prefer-binary \
    boto3 \
    "numpy>=1.24.0,<2.0" \
    "pandas>=2.0.0" \
    "scikit-learn>=1.3.0"

RUN pip install --no-cache-dir --prefer-binary rdkit-pypi

# CPU-only PyTorch — avoids the 2 GB CUDA download
RUN pip install --no-cache-dir --prefer-binary \
    "torch>=2.0.0" \
    "torchvision>=0.15.0" \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir --prefer-binary DeepPurpose

RUN pip install --no-cache-dir PyTDC

RUN pip install --no-cache-dir fastapi "uvicorn[standard]"

COPY src/ /app/src/
COPY models/ /app/models/
COPY scripts/ /app/scripts/
COPY main.py /app/main.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
