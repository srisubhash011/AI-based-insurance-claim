from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from torchvision.models.detection import fasterrcnn_resnet50_fpn
from torchvision import transforms
import pandas as pd
import numpy as np
from scipy.stats import entropy
from PIL import Image
import joblib
import io
import os
import uuid
import datetime
import firebase_admin
from firebase_admin import credentials, firestore
from web3 import Web3
from eth_account import Account
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Claims Fraud Detection API")

# Allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Firebase
FIREBASE_ENABLED = False
try:
    cred_path = os.path.join(os.path.dirname(__file__), "firebase-credentials.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        FIREBASE_ENABLED = True
        print("Firebase initialized successfully!")
    else:
        print(f"Warning: Firebase credentials not found at {cred_path}")
except Exception as e:
    print(f"Warning: Firebase could not be initialized. error: {e}")

# --- Metamask Automation Config ---
PRIVATE_KEY = os.getenv("PRIVATE_KEY", "0x0000000000000000000000000000000000000000000000000000000000000000")
RPC_URL = os.getenv("RPC_URL", "https://ethereum-hoodi-rpc.publicnode.com")
CHAIN_ID = 560048

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = None
if PRIVATE_KEY and PRIVATE_KEY != "0x0000000000000000000000000000000000000000000000000000000000000000":
    try:
        account = Account.from_key(PRIVATE_KEY)
        print(f"Metamask Bot Wallet Configured: {account.address}")
    except Exception as e:
        print(f"Metamask Config Error: {e}")

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- Load Models ---
DAMAGE_MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "notebooks", "best_model.pth")
FRAUD_MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "notebooks", "fraud_rf_model.pkl")

print(f"Loading damage model from {DAMAGE_MODEL_PATH}...")
damage_model = fasterrcnn_resnet50_fpn(weights=None, num_classes=5)
# Use weights_only=True for security since this is an untrusted environment by default now
damage_model.load_state_dict(torch.load(DAMAGE_MODEL_PATH, map_location=device, weights_only=True))
damage_model.to(device)
damage_model.eval()

print(f"Loading fraud model from {FRAUD_MODEL_PATH}...")
fraud_model = joblib.load(FRAUD_MODEL_PATH)
# Best threshold determined in 07_fraud_training.ipynb
FRAUD_THRESHOLD = 0.5245

transform = transforms.Compose([
    transforms.ToTensor()
])

def extract_features(pred, image_shape, score_threshold=0.5):
    h, w = image_shape
    image_area = h * w

    boxes = pred["boxes"].detach().cpu().numpy()
    labels = pred["labels"].detach().cpu().numpy()
    scores = pred["scores"].detach().cpu().numpy()

    valid = scores > score_threshold
    boxes = boxes[valid]
    labels = labels[valid]
    scores = scores[valid]

    num_detections = len(boxes)

    box_area_ratios = []
    class_counts = [0, 0, 0, 0]

    for box, label in zip(boxes, labels):
        x1, y1, x2, y2 = box
        area = (x2 - x1) * (y2 - y1)
        ratio = area / image_area
        box_area_ratios.append(ratio)

        if label <= 4:
            class_counts[label - 1] += 1

    total_damage_area_ratio = sum(box_area_ratios)

    avg_box_area_ratio = np.mean(box_area_ratios) if num_detections > 0 else 0
    max_box_area_ratio = np.max(box_area_ratios) if num_detections > 0 else 0
    min_box_area_ratio = np.min(box_area_ratios) if num_detections > 0 else 0
    var_box_area_ratio = np.var(box_area_ratios) if num_detections > 0 else 0

    damage_density = total_damage_area_ratio / num_detections if num_detections > 0 else 0

    class_prob = np.array(class_counts) / num_detections if num_detections > 0 else np.zeros(4)
    class_entropy = entropy(class_prob) if num_detections > 0 else 0

    mean_confidence = np.mean(scores) if len(scores) > 0 else 0

    features = [
        num_detections,
        total_damage_area_ratio,
        avg_box_area_ratio,
        max_box_area_ratio,
        min_box_area_ratio,
        var_box_area_ratio,
        damage_density,
        class_counts[0],
        class_counts[1],
        class_counts[2],
        class_counts[3],
        class_entropy,
        mean_confidence
    ]
    
    # Also return the bounding boxes for the frontend visualization
    visual_data = []
    for box, label, score in zip(boxes, labels, scores):
        visual_data.append({
            "box": [float(b) for b in box],
            "label": int(label),
            "score": float(score)
        })
        
    return features, visual_data

@app.post("/api/predict")
async def analyze_claim(file: UploadFile = File(...), policy_number: str = Form(...)):
    # 1. Read Image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    original_size = image.size
    
    # 2. Run Damage Detection
    img_tensor = transform(image).to(device)
    with torch.no_grad():
        prediction = damage_model([img_tensor])[0]
        
    # 3. Extract Features
    # Note image_shape expectation is (h, w), PIL size is (w, h)
    features, visual_data = extract_features(prediction, image_shape=original_size[::-1], score_threshold=0.5)
    
    # 4. Predict Fraud
    columns = [
        "num_detections",
        "total_damage_area_ratio",
        "avg_box_area_ratio",
        "max_box_area_ratio",
        "min_box_area_ratio",
        "var_box_area_ratio",
        "damage_density",
        "class_1_count",
        "class_2_count",
        "class_3_count",
        "class_4_count",
        "class_entropy",
        "mean_confidence"
    ]
    df = pd.DataFrame([features], columns=columns)
    
    fraud_prob = fraud_model.predict_proba(df)[0][1]
    is_fraud = bool(fraud_prob > FRAUD_THRESHOLD)
    
    claim_id = str(uuid.uuid4())
    
    # Estimate cost
    c1 = features[7] # class_1_count
    c2 = features[8] # class_2_count
    c3 = features[9] # class_3_count
    c4 = features[10] # class_4_count
    estimated_cost = float((c1 * 500) + (c2 * 300) + (c3 * 200) + (c4 * 150))

    result_data = {
        "claim_id": claim_id,
        "policy_number": policy_number,
        "review_status": "Pending",
        "fraud_score": float(fraud_prob),
        "is_fraud": is_fraud,
        "estimated_cost": estimated_cost,
        "features": {col: float(val) for col, val in zip(columns, features)},
        "created_at": datetime.datetime.utcnow().isoformat()
    }
    
    if FIREBASE_ENABLED:
        try:
            db.collection("claims").document(claim_id).set(result_data)
            print(f"Successfully saved claim {claim_id} to Firestore.")
        except Exception as e:
            print(f"Failed to write to Firebase: {e}")
            
    # 5. Return JSON
    response = result_data.copy()
    response.update({
        "status": "success",
        "detections": visual_data,
        "image_width": original_size[0],
        "image_height": original_size[1]
    })
    return response

@app.post("/api/address")
async def get_bot_address():
    if account:
        return {"address": account.address}
    return {"address": "0xBotWalletNotConfigured"}

class TransferRequest(BaseModel):
    recipientAddress: str
    amount: float

@app.post("/api/transfer")
async def execute_transfer(req: TransferRequest):
    if not account:
        return {"error": "Metamask Bot Wallet not configured on server."}
    
    try:
        print(f"DEBUG: Processing transfer of {req.amount} ETH to {req.recipientAddress}")
        
        # Verify address
        if not w3.is_address(req.recipientAddress):
            print(f"DEBUG: Invalid recipient address: {req.recipientAddress}")
            return {"error": "Invalid Ethereum address format (must be 42 characters starting with 0x)"}

        nonce = w3.eth.get_transaction_count(account.address)
        gas_price = w3.eth.gas_price
        
        tx = {
            'nonce': nonce,
            'to': w3.to_checksum_address(req.recipientAddress),
            'value': w3.to_wei(req.amount, 'ether'),
            'gas': 21000,
            'gasPrice': gas_price,
            'chainId': CHAIN_ID
        }
        
        print(f"DEBUG: signing tx with nonce {nonce} and gasPrice {gas_price}")
        
        signed_tx = w3.eth.account.sign_transaction(tx, PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        return {
            "status": "success",
            "txHash": w3.to_hex(tx_hash),
            "network": "hoodi-testnet",
            "timestamp": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "recipient": req.recipientAddress,
            "sender": account.address,
            "amountSent": f"{req.amount} ETH"
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
