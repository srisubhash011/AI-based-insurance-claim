# STEP-BY-STEP GUIDE TO RUN SMARTCLAIM AI

To run the application, you will need TWO separate terminal windows open.

### TERMINAL 1: THE AI BACKEND (Python/FastAPI)
1. Open a terminal and navigate to: `C:\Users\HP\Desktop\desktop\OPEN LAB\OP\backend`
2. Activate your environment: `conda activate dl_gpu`
3. Run the server: 
   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
   *The server is ready when it says "Application startup complete" and "Uvicorn running on http://0.0.0.0:8000".*

---

### TERMINAL 2: THE FRONTEND DASHBOARD (Vite/React)
1. Open a second terminal and navigate to: `C:\Users\HP\Desktop\desktop\OPEN LAB\OP\frontend`
2. Run the development server: 
   ```bash
   npm run dev
   ```
   *The dashboard will be available at: http://localhost:5173/*

---

### 🔑 IMPORTANT CONFIGURATION NOTES:
- **Private Key**: If you change your Metamask Bot Wallet, update the `PRIVATE_KEY` in `backend/.env`.
- **Firebase**: Ensure `firebase-credentials.json` is present in the `backend/` folder.
- **Port Conflicts**: If port 8000 is busy, you can kill the old process in Windows PowerShell with:
  ```powershell
  Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess -Force
  ```

### 🛠️ TROUBLESHOOTING:
- **404 Errors**: Usually means the Backend is NOT running. Check Terminal 1.
- **Transaction Fails**: 
   - Ensure the Bot Wallet has ETH on the Hoodi Testnet.
   - Ensure the recipient address is exactly 42 characters.
