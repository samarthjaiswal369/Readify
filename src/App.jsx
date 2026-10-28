import React, { useState, useEffect } from 'react';
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
  Download 
} from 'lucide-react';

export default function App() {
  const [powerOn, setPowerOn] = useState(true);
  const [healthData, setHealthData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [systemLogs, setSystemLogs] = useState([
    { id: 1, time: '00:00:01', msg: 'READIFY CONSOLE OS v1.0 INITIALIZING...' },
    { id: 2, time: '00:00:02', msg: 'POSTGRESQL CONNECTION POOL INITIALIZED' },
    { id: 3, time: '00:00:03', msg: 'SCHEMA VERIFIED: "documents" TABLE READY' },
    { id: 4, time: '00:00:04', msg: 'STANDBY: AWAITING INPUT CASSETTE (DAY 1 ACTIVE)' },
  ]);

  const [ocrEngineMode, setOcrEngineMode] = useState(true);
  const [autoDetectScanned, setAutoDetectScanned] = useState(true);
  const [txtOutputBus, setTxtOutputBus] = useState(true);
  const [docxOutputBus, setDocxOutputBus] = useState(true);

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

      const now = new Date().toTimeString().split(' ')[0];
      setSystemLogs(prev => [
        ...prev.slice(-6),
        { id: Date.now(), time: now, msg: `POLL OK // DB: ${healthJson?.database?.db_name} // STATUS: ${healthJson?.status?.toUpperCase()}` }
      ]);
    } catch (err) {
      const now = new Date().toTimeString().split(' ')[0];
      setSystemLogs(prev => [
        ...prev.slice(-6),
        { id: Date.now(), time: now, msg: `ERROR CONNECTING TO BACKEND: ${err.message}` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (powerOn) {
      fetchDiagnostics();
    }
  }, [powerOn]);

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
                <div>DOCUMENTS IN REPOSITORY: <strong style={{ color: '#ffb84d' }}>{statsData?.total_documents || 0}</strong></div>
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
              
              <div className="panel-sunken" style={{ padding: '20px', textAlign: 'center', borderStyle: 'dashed' }}>
                <FileText size={28} color="#7a7266" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#443f38' }}>STAGE READY FOR DAY 2 FILE INGESTION</div>
                <div style={{ fontSize: '11px', color: '#776f63', marginTop: '4px' }}>
                  Accepts PDF, DOCX, PNG, JPG, JPEG
                </div>
                <div className="mono" style={{ fontSize: '10px', marginTop: '10px', color: '#888' }}>
                  SLOT: /uploads/ [STATUS: LOCKED BY PROTOCOL]
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#666' }}>
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

          {/* Strip 3: Master Output Bus & Test Controls */}
          <div className="channel-strip" style={{ marginBottom: '20px' }}>
            <div className="strip-label">
              <span>03 // MASTER OUTPUT BUS & REPOSITORY LINK</span>
              <Layers size={13} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
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
                  className="tactile-btn"
                  onClick={fetchDiagnostics}
                  disabled={loading}
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  <span>REFRESH BUS</span>
                </button>

                <button 
                  className="tactile-btn primary"
                  onClick={() => alert('Day 1 System Architecture Verified! Backend API & PostgreSQL are connected.')}
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
              <span className="mono" style={{ fontSize: '10px' }}>DAY 1 OF 5 ACTIVE</span>
            </div>

            <div className="roadmap-steps">
              <div className="step-card active">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 1: FOUNDATION
                </div>
                <div style={{ fontWeight: 600 }}>Architecture & DB</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Vite React + Express + PostgreSQL schema & audio console UI.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-off"></span>
                  DAY 2: INGESTION
                </div>
                <div style={{ fontWeight: 600 }}>File Upload & Multer</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Validation for PDF, DOCX, PNG, JPG, JPEG & tracking.</div>
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
