import io
import logging

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

from classifier import classify_coat

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="CatSnap Coat Classifier")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    data = await file.read()
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode image")
    coat_type, confidence = classify_coat(img)
    return {"coatType": coat_type, "confidence": confidence}
