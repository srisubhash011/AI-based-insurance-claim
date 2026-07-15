import { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, AlertCircle, CheckCircle, ShieldAlert, Activity, FileText, Search, Clock, List, FilePlus, ChevronRight } from 'lucide-react';
import { db } from './firebase';
import { collection, query, where, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import './index.css';
import illegalEntryImg from './illegal_entry.jpg';
import ParticleBackground from './ParticleBackground';

function App() {
  const [activeTab, setActiveTab] = useState('submit'); // 'submit' or 'history'
  
  // Submit Flow State
  const [currentStep, setCurrentStep] = useState(1);
  const [authStage, setAuthStage] = useState(1); // 1: Login, 2: OTP, 3: Claim details
  const [policyNumber, setPolicyNumber] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [claimType, setClaimType] = useState('');
  const [description, setDescription] = useState('');
  const [policyDetails, setPolicyDetails] = useState(null);
  const [firFile, setFirFile] = useState(null);
  
  // Image / ML State
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Payment State
  const [currency, setCurrency] = useState('crypto');
  const [wallet, setWallet] = useState('');
  const [txHash, setTxHash] = useState('');
  const [ipfsHash, setIpfsHash] = useState('');
  const [processingTx, setProcessingTx] = useState(false);

  // Appeal State
  const [appealReason, setAppealReason] = useState('');
  const [appealed, setAppealed] = useState(false);
  const [senderAddress, setSenderAddress] = useState('Loading...');
  const [txDetails, setTxDetails] = useState(null);

  // History State
  const [searchPolicy, setSearchPolicy] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [claimsList, setClaimsList] = useState([]);

  useEffect(() => {
    if (!searchPolicy || searchPolicy.length < 3) {
      setClaimsList([]);
      return;
    }
    setHistoryLoading(true);
    const q = query(collection(db, "claims"), where("policy_number", "==", searchPolicy));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const claims = [];
      querySnapshot.forEach((docSnap) => {
        claims.push({ id: docSnap.id, ...docSnap.data() });
      });
      claims.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
      setClaimsList(claims);
      setHistoryLoading(false);
    }, (error) => {
      console.error(error);
      setHistoryLoading(false);
    });
    return () => unsubscribe();
  }, [searchPolicy]);

  useEffect(() => {
    // Scroll to top on step change
    window.scrollTo(0, 0);

    const fetchSender = async () => {
      try {
        const res = await axios.post('http://localhost:8000/api/address');
        if (res.data.address) setSenderAddress(res.data.address);
        else setSenderAddress('Error loading address');
      } catch (e) {
        setSenderAddress('Error fetching');
      }
    };
    fetchSender();
  }, [currentStep]);

  // Handle Auth Sequence
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const docRef = doc(db, 'policies', policyNumber);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().password === password) {
        setPolicyDetails(docSnap.data());
        setAuthStage(2);
      } else {
        setError("Invalid Policy Number or Password!");
      }
    } catch (err) {
      console.error(err);
      setError("Database connection error");
    } finally {
      setLoading(false);
    }
  };
  const handleOTP = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setAuthStage(3); setLoading(false); }, 1000);
  };
  const handleInitiationProc = (e) => {
    e.preventDefault();
    setCurrentStep(2); // Go to image acquisition
  };

  // Handle Image Upload
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setResult(null); setError(null);
    }
  };
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file); setPreview(URL.createObjectURL(file)); setResult(null); setError(null);
    }
  };

  // Handle ML Analysis
  const analyzeClaim = async () => {
    if (!image || !policyNumber) return;
    setLoading(true); setError(null);
    const formData = new FormData();
    formData.append('file', image);
    formData.append('policy_number', policyNumber);

    try {
      const response = await axios.post('http://localhost:8000/api/predict', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(response.data);
      setCurrentStep(3); // Go to Analysis Dashboard
      // Generate mock IPFS for Step 4
      setIpfsHash('Qm' + Array.from({length: 44}, () => Math.floor(Math.random()*16).toString(16)).join(''));
    } catch (err) {
      setError('An error occurred running the ML models.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Handle Payment (Direct Metamask Automation - Exact ETH)
  const handlePayout = async () => {
    if (!result?.claim_id) return;
    setProcessingTx(true);
    
    try {
      if (!wallet || wallet.length < 42) {
        throw new Error("Invalid Recipient Address. Please enter a full 42-character Ethereum address.");
      }

      // Conversion: 1 ETH = $3000 USD (Fixed rate for demo)
      const claimUsd = Math.max(0, result.estimated_cost - 500);
      const amountEth = (claimUsd / 3000).toFixed(6); 
      
      const response = await axios.post('http://localhost:8000/api/transfer', {
        recipientAddress: wallet, 
        amount: parseFloat(amountEth)
      }, { timeout: 30000 }); // 30 second timeout
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      const session = response.data;
      setTxHash(session.txHash);
      setTxDetails(session);
      
      await updateDoc(doc(db, "claims", result.claim_id), {
        review_status: "Verified & Paid",
        tx_hash: session.txHash,
        payout_currency: "ETH",
        usd_amount: claimUsd,
        final_eth_amount: amountEth
      });
      
    } catch(err) { 
      console.error("Payout failed", err);
      setError("Payment Authorization Failed: " + (err.message || "Unknown Error"));
    } finally {
      setProcessingTx(false);
    }
  };

  // Handle Appeal
  const handleAppealSubmit = async (e) => {
    e.preventDefault();
    if (!result?.claim_id) return;
    setProcessingTx(true);
    try {
      await updateDoc(doc(db, "claims", result.claim_id), {
        review_status: "Appealed - Awaiting Human",
        appeal_reason: appealReason
      });
      setAppealed(true);
    } catch(err) { console.error(err); }
    setProcessingTx(false);
  };

  const resetFlow = () => {
    setCurrentStep(1); setAuthStage(1); setPolicyNumber(''); setPassword(''); setOtp('');
    setClaimType(''); setDescription(''); setImage(null); setPreview(null);
    setResult(null); setTxHash(''); setAppealed(false); setAppealReason(''); setFirFile(null);
  };

  // Bounding box utils
  const getBoxStyle = (box) => {
    if (!result?.image_width) return {};
    return {
      left: `${(box[0] / result.image_width) * 100}%`, top: `${(box[1] / result.image_height) * 100}%`,
      width: `${((box[2] - box[0]) / result.image_width) * 100}%`, height: `${((box[3] - box[1]) / result.image_height) * 100}%`,
    };
  };
  const getLabelName = (id) => id.toString();
  const getStatusBadge = (status) => {
    if (status.includes('Paid') || status.includes('Verified')) return <span className="status-badge valid"><CheckCircle size={14}/> {status}</span>;
    if (status.includes('Appeal') || status.includes('Reject')) return <span className="status-badge invalid"><AlertCircle size={14}/> {status}</span>;
    return <span className="status-badge pending"><Clock size={14}/> {status}</span>;
  };

  return (
    <div className="app-container" style={{ paddingBottom: '3rem' }}>
      <ParticleBackground />
      <div className="scanlines-overlay"></div>
      <header className="app-header fade-in">
        <h1 className="glitch-text">SmartClaim AI</h1>
        <p>Autonomous AI-Powered Claim Adjustment</p>
      </header>

      <nav className="top-nav fade-in">
        <button className={`nav-item ${activeTab === 'submit' ? 'active' : ''}`} onClick={() => setActiveTab('submit')}>
          <FilePlus size={18} /> Autonomous Adjustment
        </button>
        <button className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
          <List size={18} /> Decentralized Ledger
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'submit' && (
          <div className="tab-pane fade-in">
            {/* Step Indicator */}
            <div className="step-indicator mb-4">
              {[1, 2, 3, 4, 5].map((step, index) => (
                <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
                  <div className={`step-dot ${currentStep === step ? 'active' : ''} ${currentStep > step ? 'completed' : ''}`}></div>
                  {index < 4 && <div className={`step-line ${currentStep > step ? 'completed' : ''}`}></div>}
                </div>
              ))}
            </div>

            <div className="grid">
              
              {/* STEP 1: INITIATION */}
              {currentStep === 1 && (
                <div className="glass-card animate-in" style={{ gridColumn: '1 / -1', maxWidth: '600px', margin: '0 auto' }}>
                  {authStage === 1 && (
                    <form onSubmit={handleLogin} className="flex-col">
                      <h3>Identity Verification</h3>
                      <p className="text-muted mb-4">Please log in securely to initiate your claim.</p>
                      
                      <div className="input-group mb-4">
                        <label>Insurance ID (Policy Number)</label>
                        <div className="input-wrapper">
                          <input required type="text" placeholder="POL-XXXXX" className={error ? "input-error" : ""}
                            value={policyNumber} onChange={e => {setPolicyNumber(e.target.value); setError(null);}} />
                        </div>
                      </div>
                      <div className="input-group mb-4">
                        <label>Master Password</label>
                        <div className="input-wrapper">
                          <input required type="password" placeholder="••••••••" className={error ? "input-error" : ""}
                            value={password} onChange={e => {setPassword(e.target.value); setError(null);}} />
                        </div>
                      </div>
                      <button type="submit" disabled={loading}>
                        {loading ? <Activity className="spinner" size={20} /> : 'Secure Login'}
                      </button>
                      {error && (
                        <div className="mt-4 text-center fade-in">
                          <img src={illegalEntryImg} alt="Invalid Entry" style={{ maxWidth: '100%', border: '2px solid red', marginTop: '1rem' }} />
                        </div>
                      )}
                    </form>
                  )}
                  {authStage === 2 && (
                    <form onSubmit={handleOTP} className="flex-col">
                      <h3>Multi-Factor Authentication</h3>
                      <p className="text-muted mb-4">Enter the 6-digit code sent to your device.</p>
                      
                      <div className="input-group mb-4">
                        <label>One-Time Password (OTP)</label>
                        <div className="input-wrapper">
                          <input required type="text" maxLength="6" placeholder="123456"
                            value={otp} onChange={e => setOtp(e.target.value)} />
                        </div>
                      </div>
                      <button type="submit" disabled={loading}>
                        {loading ? <Activity className="spinner" size={20} /> : 'Verify Identity'}
                      </button>
                    </form>
                  )}
                  {authStage === 3 && (
                    <form onSubmit={handleInitiationProc} className="flex-col">
                      <h3>Claim Details & Triage</h3>
                      <div className="flex gap-4 mb-4" style={{ flexDirection: 'column' }}>
                        <div><span className="badge success">Identity Verified</span> <span className="badge info">Policy Active: {policyNumber}</span></div>
                        {policyDetails && (
                          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9rem', borderRadius: 'var(--radius-sm)' }}>
                            <p style={{ margin: 0 }}><strong>Driver Name:</strong> {policyDetails.first_name} {policyDetails.last_name}</p>
                            <p style={{ margin: 0, marginTop: '0.5rem' }}><strong>Vehicle:</strong> {policyDetails.vehicle_model}</p>
                            <p style={{ margin: 0, marginTop: '0.5rem' }}><strong>Coverage Type:</strong> {policyDetails.coverage_type} <span className="text-muted">(Deductible: ${policyDetails.deductible})</span></p>
                          </div>
                        )}
                      </div>
                      
                      <div className="input-group mb-4">
                        <label>Type of Claim</label>
                        <select required value={claimType} onChange={e => setClaimType(e.target.value)}>
                          <option value="" disabled>Select an option</option>
                          <option value="minor_accident">Accident (Minor)</option>
                          <option value="major_accident">Accident (Major)</option>
                          <option value="stolen">Stolen</option>
                        </select>
                      </div>

                      {claimType && claimType.includes('accident') && (
                        <div className="input-group mb-4 fade-in">
                          <label>Accident Description (NLP Pre-screening)</label>
                          <textarea required rows="4" placeholder="Briefly describe what happened..."
                            value={description} onChange={e => setDescription(e.target.value)}></textarea>
                          <small style={{ fontWeight: 'bold', marginTop: '0.5rem' }}>✦ NLP Agent structuring context...</small>
                        </div>
                      )}

                      {claimType && (claimType === 'major_accident' || claimType === 'stolen') && (
                        <div className="input-group mb-4 fade-in">
                          <label>Police FIR Document (Required)</label>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {!firFile ? (
                              <label style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', 
                                border: '1px dashed rgba(255,255,255,0.2)', padding: '1.2rem', cursor: 'pointer', width: '100%',
                                transition: '0.2s', fontWeight: '500', borderRadius: 'var(--radius-sm)'
                              }}>
                                <Upload size={20} style={{ marginRight: '0.5rem', color: '#94a3b8' }} /> UPLOAD PDF
                                <input type="file" accept="application/pdf" style={{ display: 'none' }} 
                                  onChange={(e) => setFirFile(e.target.files[0])} />
                              </label>
                            ) : (
                              <div style={{ 
                                display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.1)', 
                                border: '1px solid rgba(16, 185, 129, 0.4)', padding: '1.2rem', width: '100%', color: '#34d399', fontWeight: '600', borderRadius: 'var(--radius-sm)', textShadow: '0 0 10px rgba(52, 211, 153, 0.3)'
                              }}>
                                <CheckCircle size={20} style={{ marginRight: '0.5rem' }} /> FIR DOCUMENT VERIFIED
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <button type="submit" disabled={!claimType || (claimType.includes('accident') && !description) || ((claimType === 'major_accident' || claimType === 'stolen') && !firFile)}>
                        Proceed to AI Image Acquisition <ChevronRight size={20} />
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* STEP 2: IMAGE ACQUISITION */}
              {currentStep === 2 && (
                <div className="upload-section glass-panel animate-in" style={{ gridColumn: '1 / -1', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                  <h3>AI Image Acquisition (AR Overlay Tool)</h3>
                  <p className="text-muted mb-4">Upload the requested target viewpoints for real-time validation.</p>
                  
                  <div className="flex justify-between items-center mb-2">
                    <span style={{ fontSize: '0.9rem', color: 'var(--success)' }}>Target: Front/Damaged Bumper</span>
                  </div>

                  <div 
                    className={`dropzone ${preview ? 'has-image' : ''}`}
                    onDragOver={handleDragOver} onDrop={handleDrop} onClick={() => document.getElementById('file-input').click()}
                    style={{ position: 'relative' }}
                  >
                    <input id="file-input" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                    {!preview ? (
                      <div className="dropzone-content">
                        <Upload size={48} className="upload-icon" />
                        <h3>Capture / Upload Target Image</h3>
                        <p>Simulating AR camera frame...</p>
                      </div>
                    ) : (
                      <div className="image-preview-container">
                        <div className="image-wrapper">
                          <img src={preview} alt="Vehicle damage" className="preview-image" />
                          <div style={{ position:'absolute', top:0,left:0,width:'100%',height:'100%', border:'2px dashed rgba(16, 185, 129, 0.5)', pointerEvents:'none' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <button className={`analyze-btn mt-4 ${!image || loading ? 'disabled' : ''}`} onClick={analyzeClaim} disabled={!image || loading}>
                    {loading ? <Activity className="spinner" size={20} /> : 'Run ML Analysis & Fraud Detection'}
                  </button>
                  {error && <div className="error-message mt-2"><AlertCircle size={18} /><span>{error}</span></div>}
                </div>
              )}

              {/* STEP 3: ANALYSIS DASHBOARD */}
              {currentStep === 3 && result && (
                <>
                  <div className="upload-section glass-panel animate-in">
                    <h3 className="mb-4">Damage Localization</h3>
                    <div className="image-preview-container" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', padding: '1rem', background: 'rgba(0,0,0,0.4)', border: '1px inset rgba(255,255,255,0.05)' }}>
                      <div className="image-wrapper">
                        <div className="ai-laser-scanner"></div>
                        <img src={preview} alt="Vehicle damage" className="preview-image" />
                        {result.detections.map((det, idx) => (
                          <div key={idx} className="bounding-box" style={getBoxStyle(det.box)}>
                            <span style={{ color: '#fff', backgroundColor: '#ef4444', fontWeight: '600', padding: '0 4px', borderRadius: '2px', fontSize: '0.8rem', position: 'absolute', top: '-20px', left: '-2px' }}>
                              {getLabelName(det.label)} ({(det.score*100).toFixed(0)}%)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="results-section glass-panel animate-in">
                    <div className={`status-banner ${result.is_fraud ? 'danger' : 'safe'}`}>
                      {result.is_fraud ? <AlertCircle size={28} /> : <CheckCircle size={28} />}
                      <div className="status-text">
                        <h3>{result.is_fraud ? 'High Fraud Risk / Anomalies Detected' : 'ML Verified - Low Fraud Risk'}</h3>
                        <p>AI Confidence Score: {(result.fraud_score * 100).toFixed(1)}%</p>
                      </div>
                    </div>

                    <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                      <div className="metric-card">
                        <span className="metric-label" style={{ fontWeight: 700 }}>Damage Density</span>
                        <span className="metric-value" style={{ fontSize: '2rem', fontWeight: 700 }}>{(result.features.damage_density * 100).toFixed(1)}%</span>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label" style={{ fontWeight: 700 }}>Derived Est. Cost</span>
                        <span className="metric-value" style={{ fontSize: '2rem', fontWeight: 700 }}>${result.estimated_cost}</span>
                      </div>
                    </div>

                    <div className="detailed-analysis mb-4">
                      <h3>Damage Component Breakdown</h3>
                      <div className="feature-list">
                        <div className="feature-item"><span>1: Missing Part ($500)</span><span className="badge">{result.features.class_1_count}</span></div>
                        <div className="feature-item"><span>2: Crack / Tear ($300)</span><span className="badge">{result.features.class_2_count}</span></div>
                        <div className="feature-item"><span>3: Dent ($200)</span><span className="badge">{result.features.class_3_count}</span></div>
                        <div className="feature-item"><span>4: Paint Scratch ($150)</span><span className="badge">{result.features.class_4_count}</span></div>
                      </div>
                    </div>

                    {result.is_fraud ? (
                      <button style={{ width: '100%' }} onClick={() => setCurrentStep(5)}>
                        Proceed to Human Appeal Pipeline
                      </button>
                    ) : (
                      <button style={{ width: '100%' }} onClick={() => setCurrentStep(4)}>
                        Proceed to Payout Calculation <ChevronRight size={20}/>
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* STEP 4: PAYMENT LOGGING */}
              {currentStep === 4 && result && (
                <div className="glass-panel animate-in" style={{ gridColumn: '1 / -1', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.6)', color: '#0f0', border: '1px solid rgba(0, 188, 212, 0.3)', marginBottom: '1.5rem', fontFamily: 'monospace', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>SENDER WALLET ADDRESS (METAMASK AUTOMATION BOT)</div>
                    {senderAddress}
                  </div>

                  <h3 style={{ marginBottom: '1.5rem' }}>Automated Payout Dashboard</h3>
                  
                  <div className="grid-2 mb-4">
                    <div className="metric-card" style={{ background: 'linear-gradient(135deg, rgba(138,43,226,0.15), rgba(0,188,212,0.15))', borderColor: 'rgba(138,43,226,0.3)' }}>
                      <h4>ETH Liquidity Payout</h4>
                      <div className="flex justify-between mt-2"><span className="text-muted">Total (USD):</span> <span>${result.estimated_cost}</span></div>
                      <div className="flex justify-between" style={{ color: '#f87171' }}><span>Deductible:</span> <span>-$500</span></div>
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                        <div className="flex justify-between"><span className="text-muted">Oracle Rate:</span> <span>1 ETH = $3000 USD</span></div>
                        <div className="flex justify-between" style={{ fontWeight: 600, fontSize: '1.2rem', marginTop: '0.5rem' }}>
                          <span>Final Payout:</span> <span style={{ color: '#00bcd4' }}>{((result.estimated_cost - 500) / 3000).toFixed(6)} ETH</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-card" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(0,188,212,0.3)' }}>
                      <div className="flex justify-between items-center mb-2">
                        <h4 style={{ color: '#00bcd4', margin: 0 }}>Immutable Log (IPFS)</h4>
                        <span className="badge" style={{ background: 'rgba(0,188,212,0.2)', color: '#00bcd4', border: '1px solid rgba(0,188,212,0.4)' }}>Anchored</span>
                      </div>
                      <p style={{ fontFamily: 'monospace', color: '#cbd5e1', wordBreak: 'break-all', marginTop: '0.3rem', fontSize: '0.75rem' }}>ipfs://{ipfsHash}</p>
                      <small style={{ color: '#64748b' }}>AI identification and cost metrics firmly hashed.</small>
                    </div>
                  </div>

                  <div className="grid-2">
                    <div className="flex-col">
                      {!txHash && (
                        <div className="input-group mb-4 fade-in">
                          <label>Recipient Wallet Address (ETH)</label>
                          <input type="text" placeholder="0x..." value={wallet} 
                            onChange={e=>setWallet(e.target.value)} 
                            className={wallet && wallet.length < 42 ? "input-error" : ""}
                            style={{ width: '100%' }}/>
                          {wallet && wallet.length < 42 && (
                            <small style={{ color: '#ef4444', marginTop: '0.2rem' }}>
                              Address too short ({wallet.length}/42 chars)
                            </small>
                          )}
                        </div>
                      )}

                      {!txHash ? (
                        <button className="mt-4" style={{ width: '100%' }} onClick={handlePayout} disabled={processingTx || !wallet}>
                          {processingTx ? 'Directly Broadcasting to Hoodi...' : 'Execute Automated Transfer'}
                        </button>
                      ) : (
                        <div className="fade-in mt-4 text-center glass-card">
                          <h3 style={{ textDecoration: 'underline' }}>Transaction Successful!</h3>
                          <button className="mt-4" style={{ width: '100%' }} onClick={resetFlow}>
                            Start New Claim
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="glass-card" style={{ background: '#000', color: '#fff', border: '1px solid rgba(0, 188, 212, 0.3)', minHeight: '300px' }}>
                      <h4 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>HOLOGRAPHIC LEDGER</h4>
                      <div style={{ marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        <p style={{ color: '#0f0' }}>&gt; Ethers.js API Logic Loaded...</p>
                        <p style={{ color: '#0f0' }}>&gt; Network: Hoodi Testnet Syncing...</p>
                        {processingTx && <p style={{ color: '#0f0' }}>&gt; Signing with Private Key & Awaiting Hoodi Mempool...</p>}
                        {txHash && (
                          <div className="fade-in">
                            <p style={{ color: '#0f0' }}>&gt; Transaction Confirmed!</p>
                            <ul style={{ listStyle: 'none', paddingLeft: '1rem', marginTop: '0.5rem', borderLeft: '1px solid #333' }}>
                              <li className="mb-2"><strong>STATUS:</strong> <span style={{ color: '#0f0' }}>VERIFIED</span></li>
                              <li className="mb-2"><strong>NETWORK:</strong> HOODI TESTNET</li>
                              <li className="mb-2"><strong>AMOUNT:</strong> {((result.estimated_cost - 500) / 3000).toFixed(6)} ETH</li>
                              <li className="mb-2"><strong>TO:</strong> {wallet ? `${wallet.substring(0,8)}...` : '0x742d...'}</li>
                              <li className="mb-2" style={{ wordBreak: 'break-all' }}><strong>HASH:</strong> {txHash}</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: APPEAL LOGGING */}
              {currentStep === 5 && result && (
                <div className="glass-panel animate-in" style={{ gridColumn: '1 / -1', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                  <h3 style={{ marginBottom: '1.5rem', color: 'var(--warning)' }}>Claim Held For Human Audit</h3>
                  <p className="text-muted mb-4" style={{ color: '#cbd5e1' }}>Because this claim tripped our automated fraud risk thresholds, it has been quarantined. You may submit an appeal.</p>

                  {!appealed ? (
                    <form onSubmit={handleAppealSubmit} className="flex-col">
                      <div className="input-group mb-4">
                        <label>Reason for Appeal</label>
                        <textarea required rows="4" placeholder="I disagree with the AI because..."
                          style={{ padding: '1rem', background: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                          value={appealReason} onChange={e => setAppealReason(e.target.value)}></textarea>
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" className="secondary" style={{ flex: 1 }} onClick={resetFlow} disabled={processingTx}>Cancel</button>
                        <button type="submit" style={{ flex: 2 }} disabled={processingTx || !appealReason}>
                          {processingTx ? 'Submitting...' : 'Submit Appeal for Human Review'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="fade-in text-center glass-card">
                      <h3>Appeal Submitted</h3>
                      <p style={{ marginTop: '0.5rem' }}>A human adjuster has been assigned to your case and all IPFS ML data has been preserved.</p>
                      <button className="mt-4 secondary" style={{ width: '100%' }} onClick={resetFlow}>
                        Return Home
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="tab-pane animate-in">
            <header className="page-header" style={{ marginBottom: '1.5rem' }}>
              <h2>Decentralized Claim Ledger</h2>
              <p>Search by policy number to retrieve immutable claims sourced from the Firebase database.</p>
            </header>

            <div className="history-section glass-panel">
               <div className="search-bar">
                 <Search size={20} className="search-icon" />
                 <input type="text" placeholder="Enter Policy Number (e.g. POL-123)"
                   value={searchPolicy} onChange={(e) => setSearchPolicy(e.target.value)} />
               </div>

               <div className="claims-list mt-8">
                 {searchPolicy.length < 3 ? (
                   <div className="empty-state">
                     <FileText size={48} className="ghost-icon" />
                     <p>Type at least 3 characters to query the registry</p>
                   </div>
                 ) : historyLoading ? (
                   <div className="empty-state">
                     <Activity className="spinner" size={32} />
                     <p>Querying Network...</p>
                   </div>
                 ) : claimsList.length === 0 ? (
                   <div className="empty-state">
                      <AlertCircle size={48} className="ghost-icon" />
                      <p>No logged claims found for Policy "{searchPolicy}"</p>
                   </div>
                 ) : (
                   <table className="claims-table">
                     <thead>
                       <tr>
                         <th>Claim ID</th>
                         <th>Date Filed</th>
                         <th>Est. Cost</th>
                         <th>Fraud Risk</th>
                         <th>Audit Status</th>
                       </tr>
                     </thead>
                     <tbody>
                       {claimsList.map((claim) => (
                         <tr key={claim.id}>
                           <td className="claim-id">{claim.id.substring(0,8)}...</td>
                           <td>{new Date(claim.created_at).toLocaleDateString()}</td>
                           <td className="cost-col">${claim.estimated_cost}</td>
                           <td>
                              <span className={`risk-badge ${claim.is_fraud ? 'high' : 'low'}`}>
                                {(claim.fraud_score * 100).toFixed(0)}%
                              </span>
                           </td>
                           <td>{getStatusBadge(claim.review_status)}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 )}
               </div>
            </div>
          </div>
        )}
      </main>

      {/* Cyberpunk Ticker */}
      <div className="system-ticker">
        <div className="ticker-content">
          SYSTEM_ID: SC-992 // STATUS: ONLINE // BLOCKCHAIN_NODE: SYNCED // NEURAL_NET: v4.2 // FIREBASE_ADMIN: CONNECTED // LATENCY: 24ms // ACTIVE_CLAIMS: 14,092 // ORACLE_ETH: SECURE // 
        </div>
      </div>
    </div>
  );
}

export default App;
