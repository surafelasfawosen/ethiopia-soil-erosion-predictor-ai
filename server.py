"""
Terrashield AI™ - High-Performance PyTorch AI Server
FastAPI Backend that serves the dashboard and provides native PyTorch GCN inference
using models/Erosion_GCN_Model.pth and models/Erosion_MinMaxScaler.pkl.
"""

import os
import sys
import json
import io
import numpy as np
import pandas as pd
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from ai_engine import ai_engine, PTH_PATH, PKL_PATH, SCALER_PARAMS

app = FastAPI(
    title="Terrashield AI™ Soil Erosion Engine",
    description="PyTorch Graph Convolutional Network (GCN) Soil Erosion Susceptibility Engine",
    version="2.0.0"
)

# Enable CORS for browser access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# API Routes
@app.get("/api/status")
async def get_system_status():
    """Returns AI model backend status, architecture metadata, and hardware device."""
    return {
        "status": "online",
        "engine": "Terrashield PyTorch GCN",
        "device": str(ai_engine.device),
        "is_model_loaded": ai_engine.is_loaded,
        "pth_file": os.path.basename(PTH_PATH),
        "pth_size_bytes": os.path.getsize(PTH_PATH) if os.path.exists(PTH_PATH) else 0,
        "scaler_file": os.path.basename(PKL_PATH),
        "scaler_features_count": len(ai_engine.scaler_features),
        "numerical_features": ai_engine.scaler_features,
        "architecture": {
            "type": "2-Layer Graph Convolutional Network (GCN)",
            "input_dim": 33,
            "hidden_dim": 64,
            "output_classes": 2,
            "graph_norm": "Symmetric Degree Normalization: D^(-1/2) * (A + I) * D^(-1/2)"
        }
    }


@app.post("/api/predict")
async def predict_soil_erosion(request: Request):
    """
    Accepts JSON array of telemetry records or object { "data": [...] }
    and runs PyTorch GCN forward message-passing inference.
    """
    try:
        payload = await request.json()
        if isinstance(payload, dict) and "data" in payload:
            rows = payload["data"]
        elif isinstance(payload, list):
            rows = payload
        else:
            raise HTTPException(status_code=400, detail="Invalid payload. Expected JSON list or {'data': [...]}")

        if not rows:
            return JSONResponse(content={"error": "Empty dataset provided", "predictions": []}, status_code=400)

        # Downsample if exceedingly large for instant response speed
        total_rows = len(rows)
        processed_rows = rows
        if total_rows > 3000:
            step = int(np.ceil(total_rows / 2500))
            processed_rows = rows[::step]

        # Run PyTorch forward pass directly using .pth weights & .pkl scaler
        risk_probs = ai_engine.predict(processed_rows)

        high_risk_count = sum(1 for p in risk_probs if p >= 0.5)
        avg_risk = float(np.mean(risk_probs)) if risk_probs else 0.0

        return {
            "status": "success",
            "source": "PyTorch GCN (Erosion_GCN_Model.pth & Erosion_MinMaxScaler.pkl)",
            "device": str(ai_engine.device),
            "total_received": total_rows,
            "analyzed_points": len(processed_rows),
            "average_risk": round(avg_risk, 4),
            "high_risk_count": high_risk_count,
            "safe_count": len(processed_rows) - high_risk_count,
            "predictions": risk_probs
        }

    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


@app.post("/api/upload")
async def upload_dataset_file(file: UploadFile = File(...)):
    """
    Accepts direct Excel (.xlsx/.xls) or .csv file upload, parses telemetry,
    and returns PyTorch GCN predictions.
    """
    try:
        content = await file.read()
        filename = file.filename.lower()
        if filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
        elif filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .xlsx, .xls, or .csv")

        # Downsample if exceedingly large for instant response speed
        total_rows = len(df)
        if total_rows > 3000:
            step = int(np.ceil(total_rows / 2500))
            sampled_df = df.iloc[::step].copy()
        else:
            sampled_df = df.copy()

        rows = sampled_df.to_dict(orient="records")

        # Predict
        risk_probs = ai_engine.predict(rows)
        sampled_df["AI_Erosion_Risk_Probability"] = risk_probs
        sampled_df["AI_Predicted_Class"] = ["High Risk" if p >= 0.5 else "Low/Stable" for p in risk_probs]

        return {
            "status": "success",
            "filename": file.filename,
            "total_rows": total_rows,
            "analyzed_points": len(rows),
            "high_risk_count": sum(1 for p in risk_probs if p >= 0.5),
            "predictions": risk_probs,
            "rows": rows,
            "sample_results": sampled_df.head(10).to_dict(orient="records")
        }

    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


# Serve Static Assets & Essential Root Files
app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")
app.mount("/models", StaticFiles(directory=os.path.join(BASE_DIR, "models")), name="models")

@app.get("/favicon.ico")
async def get_favicon():
    """Eliminates 404 error when browser requests /favicon.ico"""
    return Response(content=b"", media_type="image/x-icon", status_code=204)

@app.get("/dashboard.css")
async def get_css():
    return FileResponse(os.path.join(BASE_DIR, "dashboard.css"), media_type="text/css")

@app.get("/")
@app.get("/index.html")
async def get_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"), media_type="text/html")



def launch_browser(url):
    import time
    import subprocess
    import webbrowser

    time.sleep(1.2)
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
    ]
    for p in edge_paths:
        if os.path.exists(p):
            try:
                subprocess.Popen([p, url])
                return
            except Exception:
                pass
    try:
        webbrowser.open(url)
    except Exception:
        pass


def free_port(port=8000):
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.4)
        in_use = (s.connect_ex(('127.0.0.1', port)) == 0)
        s.close()
        if in_use:
            import subprocess
            out = subprocess.check_output(f'netstat -ano | findstr :{port} | findstr LISTENING', shell=True).decode(errors='ignore')
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) != os.getpid():
                        subprocess.run(f'taskkill /F /PID {pid}', shell=True, capture_output=True)
            import time
            time.sleep(0.6)
    except Exception:
        pass


def start_server(host="127.0.0.1", port=8000):
    import threading
    free_port(port)
    url = f"http://{host}:{port}"
    print("=" * 70)
    print("   TERRASHIELD AI™ - PYTORCH GCN SOIL EROSION ENGINE")
    print(f"   Model:  {PTH_PATH}")
    print(f"   Scaler: {PKL_PATH}")
    print(f"   URL:    {url}")
    print("=" * 70)

    # Automatically launch Microsoft Edge in background thread
    threading.Thread(target=launch_browser, args=(url,), daemon=True).start()

    uvicorn.run(app, host=host, port=port, log_level="info")



if __name__ == "__main__":
    start_server()

