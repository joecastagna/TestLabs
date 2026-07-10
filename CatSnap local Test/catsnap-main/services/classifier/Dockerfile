FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch before other requirements so pip doesn't pull GPU wheels
RUN pip install --no-cache-dir \
    torch==2.3.1+cpu \
    torchvision==0.18.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download EfficientNet-B0 weights at build time so container startup is fast
RUN python -c "import timm; timm.create_model('efficientnet_b0', pretrained=True); print('EfficientNet-B0 weights cached')"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
