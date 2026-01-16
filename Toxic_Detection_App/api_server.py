# api_server.py
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModel, AutoConfig
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from underthesea import word_tokenize
import re
import os

# --- 1. ĐỊNH NGHĨA MODEL (Giống hệt lúc Train) ---
class PhoBERT_Classifier(nn.Module):
    def __init__(self, num_labels=2):
        super(PhoBERT_Classifier, self).__init__()
        # Load cấu hình từ thư mục saved_model để không cần mạng internet
        # Nếu lỗi thì nó sẽ tự tải lại từ HuggingFace
        try:
            self.phobert = AutoModel.from_pretrained("./saved_model")
        except:
            print("⚠️ Không tìm thấy config offline, đang tải từ Internet...")
            self.phobert = AutoModel.from_pretrained("vinai/phobert-base-v2")
            
        self.fc = nn.Linear(768, num_labels)

    def forward(self, input_ids, attention_mask):
        features = self.phobert(input_ids=input_ids, attention_mask=attention_mask)
        cls_output = features.last_hidden_state[:, 0, :]
        logits = self.fc(cls_output)
        return logits

# --- 2. KHỞI TẠO SERVER ---
app = FastAPI()

# Cho phép Web của bạn (chạy ở localhost:3000) gọi vào
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. LOAD MODEL & TOKENIZER ---
MODEL_PATH = "./saved_model/phobert_toxic.pth"
TOKENIZER_PATH = "./saved_model"

print("⏳ Đang khởi động AI Server...")
device = torch.device("cpu") # Chạy trên máy tính cá nhân dùng CPU

try:
    # Load Tokenizer từ các file: vocab.txt, bpe.codes...
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_PATH, local_files_only=True)
    
    # Load Model
    model = PhoBERT_Classifier()
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model.to(device)
    model.eval()
    print("✅ Load Model thành công! Sẵn sàng nhận yêu cầu.")
except Exception as e:
    print(f"❌ LỖI LOAD MODEL: {e}")
    print("👉 Bạn hãy kiểm tra lại xem đã bỏ đủ file vào thư mục 'saved_model' chưa nhé!")

# --- 4. HÀM XỬ LÝ TEXT ---
def preprocess_text(text):
    text = text.lower()
    text = re.sub(r'[^\w\s]', '', text)
    text = word_tokenize(text, format="text") 
    return text

class CommentRequest(BaseModel):
    text: str

@app.post("/predict")
async def predict(item: CommentRequest):
    if not item.text:
        return {"is_toxic": False}

    try:
        # 1. Tiền xử lý
        clean_text = preprocess_text(item.text)
        
        # 2. Mã hóa (Tokenize)
        encoding = tokenizer(
            clean_text,
            return_tensors='pt',
            max_length=128,
            padding='max_length',
            truncation=True
        )
        
        input_ids = encoding['input_ids'].to(device)
        attention_mask = encoding['attention_mask'].to(device)
        
        # 3. Dự đoán
        with torch.no_grad():
            outputs = model(input_ids, attention_mask)
            probs = torch.nn.functional.softmax(outputs, dim=1)
            pred_label = torch.argmax(probs, dim=1).item()
            confidence = probs[0][pred_label].item()
            
        return {
            "text": item.text,
            "is_toxic": True if pred_label == 1 else False,
            "confidence": round(confidence, 4)
        }
        
    except Exception as e:
        print(f"Lỗi: {e}")
        raise HTTPException(status_code=500, detail="Lỗi xử lý AI")

# Lệnh chạy: uvicorn api_server:app --reload