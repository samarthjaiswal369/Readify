import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, 
  Database, 
  Activity, 
  HardDrive, 
  CheckCircle2, 
  RefreshCw, 
  Power, 
  FileText, 
  Cpu, 
  Layers, 
  Download,
  UploadCloud,
  AlertTriangle,
  XCircle,
  FileCheck
} from 'lucide-react';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function App() {
  const [powerOn, setPowerOn] = useState(true);
  const [healthData, setHealthData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [systemLogs, setSystemLogs] = useState([
    { id: 1, time: '00:00:01', msg: 'READIFY CONSOLE OS v1.0 INITIALIZING...' },
    { id: 2, time: '00:00:02', msg: 'POSTGRESQL CONNECTION POOL INITIALIZED' },
    { id: 3, time: '00:00:03', msg: 'SCHEMA VERIFIED: "documents" TABLE READY' },
    { id: 4, time: '00:00:04', msg: 'STANDBY: AWAITING INPUT CASSETTE (DAY 2 INGESTION ACTIVE)' },
  ]);

  const [ocrEngineMode, setOcrEngineMode] = useState(true);
  const [autoDetectScanned, setAutoDetectScanned] = useState(true);
  const [txtOutputBus, setTxtOutputBus] = useState(true);
  const [docxOutputBus, setDocxOutputBus] = useState(true);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const fileInputRef = useRef(null);

  const addLog = (msg) => {
    const now = new Date().toTimeString().split(' ')[0];
    setSystemLogs(prev => [
      ...prev.slice(-6),
      { id: Date.now() + Math.random(), time: now, msg }
    ]);
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const fetchDiagnostics = async () => {
    if (!powerOn) return;
    setLoading(true);
    try {
      const healthRes = await fetch('/api/health');
      const healthJson = await healthRes.json();
      setHealthData(healthJson);

      const statsRes = await fetch('/api/documents/stats');
      const statsJson = await statsRes.json();
      setStatsData(statsJson);

      await fetchDocuments();

      addLog(`POLL OK // DB: ${healthJson?.database?.db_name || 'ONLINE'} // STATUS: ${healthJson?.status?.toUpperCase()}`);
    } catch (err) {
      addLog(`ERROR CONNECTING TO BACKEND: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (powerOn) {
      fetchDiagnostics();
    }
  }, [powerOn]);

  const handleSelectFile = (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setSelectedFile(file);
    setUploadError(null);
    setUploadSuccess(null);
    addLog(`CASSETTE MOUNTED: ${file.name} (${formatFileSize(file.size)})`);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      handleSelectFile(e.dataTransfer.files);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    addLog('CASSETTE EJECTED FROM INPUT BAY');
  };

  const handleUpload = async () => {
    if (uploading || !selectedFile) return;

    // Client-side quick check for 15 MB limit
    const MAX_SIZE = 15 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      const err = `File size exceeds the 15 MB limit (${formatFileSize(selectedFile.size)}).`;
      setUploadError(err);
      addLog(`REJECTED // ${err}`);
      return;
    }

    // Client-side quick check for format
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const allowed = ['pdf', 'docx', 'png', 'jpg', 'jpeg'];
    if (!allowed.includes(ext)) {
      const err = `Unsupported format ".${ext}". Allowed formats: PDF, DOCX, PNG, JPG, JPEG.`;
      setUploadError(err);
      addLog(`REJECTED // ${err}`);
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    addLog(`INGESTING CASSETTE: ${selectedFile.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data.error || 'Server error occurred during file upload.';
        setUploadError(errorMsg);
        addLog(`INGESTION FAILED // ${errorMsg}`);
      } else {
        setUploadSuccess(data.document);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        addLog(`OK // CASSETTE REGISTERED [ID #${data.document.id}] (${data.document.original_name})`);

        // Refresh real data from PostgreSQL
        await fetchDiagnostics();
      }
    } catch (networkError) {
      const msg = `Network connection error: ${networkError.message}`;
      setUploadError(msg);
      addLog(`ERR // ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="console-chassis">
      {/* Corner Chassis Screws */}
      <div className="screw screw-tl"></div>
      <div className="screw screw-tr"></div>
      <div className="screw screw-bl"></div>
      <div className="screw screw-br"></div>

      {/* Header Faceplate */}
      <header className="console-header">
        <div className="branding-plate">
          <div className="metal-badge">RD-500 CHASSIS</div>
          <div>
            <h1 className="console-title">READIFY</h1>
            <p className="console-subtitle">Document Digitization Workstation</p>
          </div>
        </div>

        <div className="switch-group">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className={`led-lamp ${powerOn ? (healthData?.status === 'online' ? 'led-green' : 'led-amber') : 'led-off'}`}></span>
            <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: '#555' }}>
              {powerOn ? (healthData?.status === 'online' ? 'PWR ONLINE' : 'PWR STANDBY') : 'SYS OFF'}
            </span>
          </div>

          <div 
            className={`rocker-switch ${powerOn ? 'active' : ''}`}
            onClick={() => setPowerOn(!powerOn)}
            role="switch"
            aria-checked={powerOn}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setPowerOn(!powerOn); }}
            title="Toggle Console Power"
          >
            <div className="rocker-knob"></div>
          </div>
        </div>
      </header>

      {/* Main Console Content */}
      {powerOn ? (
        <>
          {/* Diagnostic Display Monitor */}
          <div style={{ marginBottom: '20px' }}>
            <div className="crt-screen">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #2a3a32', paddingBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={14} color="#5af0a2" />
                  <span style={{ fontWeight: 700 }}>TELEMETRY BUS // POSTGRESQL HOST: ACTIVE</span>
                </div>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <span>DB: <strong style={{ color: '#fff' }}>{healthData?.database?.db_name || 'CONNECTING...'}</strong></span>
                  <span>STATUS: <strong style={{ color: '#5af0a2' }}>{healthData?.status?.toUpperCase() || 'QUERYING'}</strong></span>
                </div>
              </div>

              {/* Console log ticker */}
              <div style={{ minHeight: '80px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {systemLogs.map(log => (
                  <div key={log.id} style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                    <span style={{ opacity: 0.6 }}>[{log.time}]</span>
                    <span>{log.msg}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #2a3a32', fontSize: '11px' }}>
                <div>DOCUMENTS IN REPOSITORY: <strong style={{ color: '#ffb84d' }}>{statsData?.total_documents || documents.length || 0}</strong></div>
                <div>CHARS EXTRACTED: <strong style={{ color: '#ffb84d' }}>{statsData?.total_characters_extracted || 0}</strong></div>
                <div style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={fetchDiagnostics}>
                  {loading ? 'POLLING...' : '[PING DIAGNOSTICS]'}
                </div>
              </div>
            </div>
          </div>

          {/* Console Channel Strips Grid */}
          <div className="console-grid">
            {/* Strip 1: Input Cassette Bay */}
            <div className="channel-strip">
              <div className="strip-label">
                <span>01 // INPUT CASSETTE BAY</span>
                <HardDrive size={13} />
              </div>

              {/* Hidden file input */}
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".pdf,.docx,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg"
                onChange={(e) => handleSelectFile(e.target.files)}
              />
              
              {!selectedFile ? (
                /* Empty dropzone state */
                <div 
                  className={`cassette-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  tabIndex={0}
                  role="button"
                  aria-label="Upload document cassette dropzone"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                >
                  <UploadCloud size={30} color={isDragging ? '#2fa35b' : '#7a7266'} style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#443f38' }}>
                    {isDragging ? 'RELEASE TO INSERT CASSETTE' : 'DROP DOCUMENT CASSETTE HERE'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#776f63', marginTop: '4px' }}>
                    Supports PDF, DOCX, PNG, JPG, JPEG
                  </div>
                  <div className="mono" style={{ fontSize: '10px', marginTop: '8px', color: '#888' }}>
                    MAX CASSETTE LIMIT: 15.0 MB
                  </div>
                  <button 
                    type="button"
                    className="tactile-btn" 
                    style={{ marginTop: '12px', fontSize: '11px', padding: '6px 12px' }}
                    onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  >
                    <FileText size={12} />
                    <span>SELECT FILE</span>
                  </button>
                </div>
              ) : (
                /* File Mounted/Selected State */
                <div className="cassette-cartridge">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className="led-lamp led-green"></span>
                      <span className="mono" style={{ fontSize: '10px', fontWeight: 700, color: '#333' }}>CASSETTE MOUNTED</span>
                    </div>
                    <span className="cartridge-badge">
                      {selectedFile.name.split('.').pop().toUpperCase()}
                    </span>
                  </div>

                  <div style={{ margin: '4px 0' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#2b2824', wordBreak: 'break-all' }}>
                      {selectedFile.name}
                    </div>
                    <div className="mono" style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                      SIZE: <strong style={{ color: selectedFile.size > 15 * 1024 * 1024 ? '#d33c2f' : '#2b2824' }}>{formatFileSize(selectedFile.size)}</strong> // LIMIT: 15.0 MB
                    </div>
                  </div>

                  {selectedFile.size > 15 * 1024 * 1024 && (
                    <div className="telemetry-alert error" style={{ fontSize: '10px', padding: '6px 8px' }}>
                      <AlertTriangle size={12} />
                      <span>WARNING: File exceeds 15 MB limit. Ingestion will fail.</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button 
                      type="button"
                      className="tactile-btn primary"
                      style={{ flex: 1, justifyContent: 'center' }}
                      onClick={handleUpload}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>INGESTING...</span>
                        </>
                      ) : (
                        <>
                          <HardDrive size={13} />
                          <span>INGEST CASSETTE</span>
                        </>
                      )}
                    </button>

                    <button 
                      type="button"
                      className="tactile-btn"
                      onClick={clearSelectedFile}
                      disabled={uploading}
                      title="Eject cassette"
                    >
                      <span>EJECT</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Status Alert Banners */}
              {uploadError && (
                <div className="telemetry-alert error">
                  <XCircle size={14} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>{uploadError}</div>
                  <span 
                    style={{ cursor: 'pointer', fontWeight: 700, marginLeft: '4px' }} 
                    onClick={() => setUploadError(null)}
                  >
                    ×
                  </span>
                </div>
              )}

              {uploadSuccess && (
                <div className="telemetry-alert success">
                  <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    INGESTED: <strong>{uploadSuccess.original_name}</strong> [ID #{uploadSuccess.id}]
                  </div>
                  <span 
                    style={{ cursor: 'pointer', fontWeight: 700, marginLeft: '4px' }} 
                    onClick={() => setUploadSuccess(null)}
                  >
                    ×
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#666', marginTop: 'auto' }}>
                <span>AUTO-DETECT SCANNED PDFS</span>
                <div 
                  className={`rocker-switch ${autoDetectScanned ? 'active' : ''}`}
                  style={{ width: '40px', height: '22px' }}
                  onClick={() => setAutoDetectScanned(!autoDetectScanned)}
                >
                  <div className="rocker-knob" style={{ width: '16px', height: '16px' }}></div>
                </div>
              </div>
            </div>

            {/* Strip 2: OCR & Processing Unit */}
            <div className="channel-strip">
              <div className="strip-label">
                <span>02 // PROCESSING CORES</span>
                <Cpu size={13} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>TESSERACT.JS OCR CORE</div>
                    <div style={{ fontSize: '10px', color: '#776f63' }}>Optical character recognition for scanned pages & images</div>
                  </div>
                  <div 
                    className={`rocker-switch ${ocrEngineMode ? 'active' : ''}`}
                    style={{ width: '40px', height: '22px' }}
                    onClick={() => setOcrEngineMode(!ocrEngineMode)}
                  >
                    <div className="rocker-knob" style={{ width: '16px', height: '16px' }}></div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>PDFJS-DIST TEXT EXTRACTOR</div>
                    <div style={{ fontSize: '10px', color: '#776f63' }}>Direct vector text layer extraction</div>
                  </div>
                  <span className="led-lamp led-green"></span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>MAMMOTH WORD PARSER</div>
                    <div style={{ fontSize: '10px', color: '#776f63' }}>Raw DOCX XML to clean plain text conversion</div>
                  </div>
                  <span className="led-lamp led-green"></span>
                </div>
              </div>

              {/* VU meter simulation */}
              <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                <div className="mono" style={{ fontSize: '9px', color: '#888', marginBottom: '4px' }}>PROCESSING SIGNAL HEADROOM</div>
                <div className="vu-meter">
                  <div className="vu-segment lit-green"></div>
                  <div className="vu-segment lit-green"></div>
                  <div className="vu-segment lit-green"></div>
                  <div className="vu-segment lit-green"></div>
                  <div className="vu-segment lit-green"></div>
                  <div className="vu-segment lit-amber"></div>
                  <div className="vu-segment"></div>
                  <div className="vu-segment"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Strip 3: Real Document Repository Archive */}
          <div className="channel-strip" style={{ marginBottom: '20px' }}>
            <div className="strip-label">
              <span>03 // CASSETTE REPOSITORY ARCHIVE (POSTGRESQL DB)</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="cartridge-badge" style={{ background: '#2fa35b' }}>
                  {documents.length} STORED
                </span>
                <Database size={13} />
              </div>
            </div>

            <div className="console-table-container">
              {documents.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: '#777', fontFamily: "'Chivo Mono', monospace", fontSize: '11px' }}>
                  <FileText size={22} color="#555" style={{ margin: '0 auto 8px' }} />
                  <div>NO CASSETTES IN STORAGE BAY</div>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                    Insert and ingest a PDF, DOCX, or Image in Bay 01 to populate repository.
                  </div>
                </div>
              ) : (
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>ORIGINAL FILENAME</th>
                      <th>TYPE</th>
                      <th>SIZE</th>
                      <th>INGEST STATUS</th>
                      <th>RECORDED TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td style={{ color: '#5af0a2', fontWeight: 700 }}>#{doc.id}</td>
                        <td style={{ fontWeight: 600, color: '#f7f4ec' }}>{doc.original_name}</td>
                        <td>
                          <span className="cartridge-badge">
                            {(doc.file_type || 'file').toUpperCase()}
                          </span>
                        </td>
                        <td>{formatFileSize(doc.file_size)}</td>
                        <td>
                          <span className={`doc-status-tag ${doc.status || 'uploaded'}`}>
                            <span className={`led-lamp ${doc.status === 'completed' ? 'led-green' : 'led-amber'}`} style={{ width: '6px', height: '6px' }}></span>
                            {doc.status || 'uploaded'}
                          </span>
                        </td>
                        <td style={{ color: '#8fa696' }}>{formatDate(doc.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', paddingTop: '8px' }}>
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div 
                    className={`rocker-switch ${txtOutputBus ? 'active' : ''}`}
                    style={{ width: '40px', height: '22px' }}
                    onClick={() => setTxtOutputBus(!txtOutputBus)}
                  >
                    <div className="rocker-knob" style={{ width: '16px', height: '16px' }}></div>
                  </div>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 700 }}>TXT BUS</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div 
                    className={`rocker-switch ${docxOutputBus ? 'active' : ''}`}
                    style={{ width: '40px', height: '22px' }}
                    onClick={() => setDocxOutputBus(!docxOutputBus)}
                  >
                    <div className="rocker-knob" style={{ width: '16px', height: '16px' }}></div>
                  </div>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: 700 }}>DOCX BUS</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  type="button"
                  className="tactile-btn"
                  onClick={fetchDiagnostics}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>REFRESH BUS</span>
                </button>

                <button 
                  type="button"
                  className="tactile-btn primary"
                  onClick={() => alert(`Day 2 Active Ingestion Bay Verified!\nDocuments in PostgreSQL: ${documents.length}`)}
                >
                  <CheckCircle2 size={14} color="#5af0a2" />
                  <span>DIAGNOSTIC TEST</span>
                </button>
              </div>
            </div>
          </div>

          {/* 5-Day Project Roadmap Rack */}
          <div className="roadmap-container">
            <div className="strip-label">
              <span>5-DAY COLLEGE PROJECT PROGRESSION LOG</span>
              <span className="mono" style={{ fontSize: '10px' }}>DAY 2 OF 5 ACTIVE</span>
            </div>

            <div className="roadmap-steps">
              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 1: FOUNDATION
                </div>
                <div style={{ fontWeight: 600 }}>Architecture & DB</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Vite React + Express + PostgreSQL schema & console chassis.</div>
              </div>

              <div className="step-card active">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 2: INGESTION
                </div>
                <div style={{ fontWeight: 600 }}>File Upload & Multer</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Drag-and-drop, signature validation & PostgreSQL tracking.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-off"></span>
                  DAY 3: CONVERSION
                </div>
                <div style={{ fontWeight: 600 }}>OCR & Extraction</div>
                <div style={{ fontSize: '10px', color: '#666' }}>pdfjs-dist digital text, tesseract.js OCR & mammoth.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-off"></span>
                  DAY 4: EXPORT BUS
                </div>
                <div style={{ fontWeight: 600 }}>TXT & DOCX Output</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Machine-readable document generators & download endpoints.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-off"></span>
                  DAY 5: POLISH & LOGS
                </div>
                <div style={{ fontWeight: 600 }}>History & Final Touch</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Document history table, audio console polish & README.</div>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Console Powered Down State */
        <div className="panel-sunken" style={{ padding: '60px 20px', textAlign: 'center' }}>
          <Power size={48} color="#7a7266" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
          <h2 style={{ fontSize: '18px', color: '#555', marginBottom: '8px' }}>CONSOLE IN STANDBY MODE</h2>
          <p style={{ fontSize: '13px', color: '#777', maxWidth: '400px', margin: '0 auto 20px' }}>
            Switch the master power lever in the top right to energize the audio-console chassis and initialize diagnostic telemetry.
          </p>
          <button 
            type="button"
            className="tactile-btn primary"
            onClick={() => setPowerOn(true)}
          >
            <Power size={14} />
            <span>ENERGIZE CONSOLE</span>
          </button>
        </div>
      )}
    </div>
  );
}
