FROM public.ecr.aws/lambda/python:3.11

# The Lambda AL2 base has no C compiler — every package must ship a pre-built
# wheel. numpy>=2.0 dropped manylinux2014 wheels, so we pin below 2.0.

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

COPY src/ ${LAMBDA_TASK_ROOT}/src/
COPY models/ ${LAMBDA_TASK_ROOT}/models/

CMD ["src.handler.lambda_handler"]
