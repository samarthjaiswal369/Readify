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
  FileCheck,
  Eye,
  X,
  Trash2,
  Search,
  Filter,
  RotateCcw,
  Tag,
  Edit3,
  Save,
  Sparkles
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
    { id: 4, time: '00:00:04', msg: 'STANDBY: AWAITING INPUT CASSETTE (DAY 4 EXPORT ACTIVE)' },
  ]);

  const [ocrEngineMode, setOcrEngineMode] = useState(true);
  const [autoDetectScanned, setAutoDetectScanned] = useState(true);
  const [txtOutputBus, setTxtOutputBus] = useState(true);
  const [docxOutputBus, setDocxOutputBus] = useState(true);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const fileInputRef = useRef(null);

  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState(null);
  const [deletingIds, setDeletingIds] = useState([]);
  const [deletionNotice, setDeletionNotice] = useState(null);

  const [processingIds, setProcessingIds] = useState([]);
  const [processingNotice, setProcessingNotice] = useState(null);
  const [convertingIds, setConvertingIds] = useState([]);
  const [conversionNotice, setConversionNotice] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewProcessing, setPreviewProcessing] = useState(null);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const [isEditingText, setIsEditingText] = useState(false);
  const [editedTextValue, setEditedTextValue] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [saveTextNotice, setSaveTextNotice] = useState(null);

  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  const addLog = (msg) => {
    const now = new Date().toTimeString().split(' ')[0];
    setSystemLogs(prev => [
      ...prev.slice(-6),
      { id: Date.now() + Math.random(), time: now, msg }
    ]);
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const fetchDocuments = async (overrideParams = {}) => {
    setDocumentsLoading(true);
    setDocumentsError(null);
    try {
      const query = new URLSearchParams();
      const currentSearch = overrideParams.search !== undefined ? overrideParams.search : searchTerm;
      const currentStatus = overrideParams.status !== undefined ? overrideParams.status : statusFilter;
      const currentType = overrideParams.type !== undefined ? overrideParams.type : typeFilter;
      const currentCategory = overrideParams.category !== undefined ? overrideParams.category : categoryFilter;

      if (currentSearch && currentSearch.trim()) {
        query.append('search', currentSearch.trim());
      }
      if (currentStatus && currentStatus !== 'all') {
        query.append('status', currentStatus);
      }
      if (currentType && currentType !== 'all') {
        query.append('type', currentType);
      }
      if (currentCategory && currentCategory !== 'all') {
        query.append('category_id', currentCategory);
      }

      const queryString = query.toString();
      const url = queryString ? `/api/documents?${queryString}` : '/api/documents';
      const res = await fetch(url);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch documents.');
      }
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      setDocumentsError(err.message);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const fetchDocumentHistory = async (documentId) => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}/history`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load document history.');
      }

      setHistoryEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      setHistoryEvents([]);
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleProcessDocument = async (documentId) => {
    if (processingIds.includes(documentId)) return;

    setProcessingIds(current => [...current, documentId]);
    setProcessingNotice(null);
    setDocuments(current => current.map(doc =>
      doc.id === documentId ? { ...doc, status: 'processing' } : doc
    ));

    addLog(`PROCESSING DOCUMENT #${documentId} // OCR: ${ocrEngineMode ? 'ON' : 'OFF'} // AUTO-DETECT: ${autoDetectScanned ? 'ON' : 'OFF'}`);

    try {
      const response = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ocrEnabled: ocrEngineMode,
          autoDetectScanned: autoDetectScanned
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Document processing failed.');
      }

      setPreviewDocument({
        ...data.document,
        has_txt_output: false,
        has_docx_output: false
      });
      setEditedTextValue(data.document.extracted_text || '');
      setIsEditingText(false);
      setSaveTextNotice(null);
      setPreviewProcessing(data.processing || null);
      setPreviewError(null);
      setPreviewOpen(true);
      await fetchDocumentHistory(documentId);
      await fetchDocumentSummary(documentId);

      setProcessingNotice({
        type: 'success',
        message: `DOCUMENT #${documentId} PROCESSED SUCCESSFULLY.`
      });

      addLog(`PROCESSING COMPLETE // DOCUMENT #${documentId} // OCR: ${data.document.ocr_engine || 'NOT REQUIRED'}`);
    } catch (error) {
      setProcessingNotice({
        type: 'error',
        message: `DOCUMENT #${documentId}: ${error.message}`
      });

      addLog(`PROCESSING FAILED // #${documentId} // ${error.message}`);
    } finally {
      setProcessingIds(current =>
        current.filter(id => id !== documentId)
      );

      await fetchDiagnostics();
    }
  };

  const handleViewText = async (documentId) => {
    setPreviewOpen(true);
    setPreviewDocument(null);
    setPreviewProcessing(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setHistoryEvents([]);
    setHistoryError(null);

    try {
      const response = await fetch(`/api/documents/${documentId}`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load extracted text.');
      }

      setPreviewDocument(data);
      setEditedTextValue(data.extracted_text || '');
      setIsEditingText(false);
      setSaveTextNotice(null);
      await fetchDocumentHistory(documentId);
      await fetchDocumentSummary(documentId);
    } catch (error) {
      setPreviewError(error.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConvertDocument = async (documentId) => {
    if (convertingIds.includes(documentId)) return;

    setConvertingIds(current => [...current, documentId]);
    setConversionNotice(null);

    addLog(`GENERATING TXT AND DOCX OUTPUTS // DOCUMENT #${documentId}`);

    try {
      const response = await fetch(`/api/documents/${documentId}/convert`, {
        method: 'POST'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Document conversion failed.');
      }

      setDocuments(current => current.map(doc =>
        doc.id === documentId
          ? { ...doc, has_txt_output: true, has_docx_output: true }
          : doc
      ));

      setPreviewDocument(current =>
        current?.id === documentId
          ? { ...current, has_txt_output: true, has_docx_output: true }
          : current
      );

      setConversionNotice({
        type: 'success',
        documentId,
        message: `DOCUMENT #${documentId}: TXT AND DOCX OUTPUTS READY.`
      });

      addLog(`EXPORT COMPLETE // DOCUMENT #${documentId} // TXT + DOCX READY`);
      await fetchDocumentHistory(documentId);
    } catch (error) {
      setConversionNotice({
        type: 'error',
        documentId,
        message: `DOCUMENT #${documentId}: ${error.message}`
      });

      addLog(`EXPORT FAILED // #${documentId} // ${error.message}`);
    } finally {
      setConvertingIds(current =>
        current.filter(id => id !== documentId)
      );

      await fetchDocuments();
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewDocument(null);
    setPreviewProcessing(null);
    setPreviewError(null);
    setHistoryEvents([]);
    setHistoryError(null);
    setIsEditingText(false);
    setEditedTextValue('');
    setSaveTextNotice(null);
    setSummaryData(null);
    setSummaryError(null);
    setSummaryLoading(false);
  };

  const fetchDocumentSummary = async (documentId) => {
    try {
      const res = await fetch(`/api/documents/${documentId}/summary`);
      if (res.ok) {
        const data = await res.json();
        setSummaryData(data.summary || null);
      }
    } catch (_) {
      setSummaryData(null);
    }
  };

  const handleGenerateSummary = async (documentId) => {
    if (summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    addLog(`COMPUTING EXTRACTIVE SUMMARY // DOCUMENT #${documentId}...`);

    try {
      const res = await fetch(`/api/documents/${documentId}/summarize`, {
        method: 'POST'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate document summary.');
      }
      setSummaryData(data.summary);
      addLog(`SUMMARY OK // DOCUMENT #${documentId} (${data.summary.word_count} WORDS)`);
      await fetchDocumentHistory(documentId);
    } catch (err) {
      setSummaryError(err.message);
      addLog(`SUMMARY FAILED // #${documentId} // ${err.message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleSaveEditedText = async () => {
    if (!previewDocument || savingText) return;

    setSavingText(true);
    setSaveTextNotice(null);

    try {
      const response = await fetch(`/api/documents/${previewDocument.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted_text: editedTextValue })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save updated text.');
      }

      setPreviewDocument(current => ({
        ...current,
        ...data.document
      }));

      setDocuments(current => current.map(doc =>
        doc.id === previewDocument.id
          ? {
              ...doc,
              extracted_character_count: data.document.extracted_character_count,
              extracted_word_count: data.document.extracted_word_count,
              has_txt_output: false,
              has_docx_output: false
            }
          : doc
      ));

      setIsEditingText(false);
      setSaveTextNotice({
        type: 'success',
        message: `TEXT SAVED FOR #${previewDocument.id}. OUTPUT BUS RESET FOR RE-CONVERSION.`
      });
      addLog(`TEXT EDITED // #${previewDocument.id} // ${data.document.extracted_character_count} CHARS SAVED`);
      await fetchDocumentHistory(previewDocument.id);
    } catch (err) {
      setSaveTextNotice({
        type: 'error',
        message: `FAILED TO SAVE EDITS: ${err.message}`
      });
      addLog(`EDIT FAILED // #${previewDocument.id} // ${err.message}`);
    } finally {
      setSavingText(false);
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
      fetchCategories();
    }
  }, [powerOn]);

  useEffect(() => {
    if (!powerOn) return;
    const timeoutId = setTimeout(() => {
      fetchDocuments();
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, statusFilter, typeFilter, categoryFilter, powerOn]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setCategoryFilter('all');
    fetchDocuments({ search: '', status: 'all', type: 'all', category: 'all' });
    addLog('FILTERS RESET // ALL CASSETTES MOUNTED');
  };

  const handleDeleteDocument = async (documentId, documentName) => {
    if (deletingIds.includes(documentId)) return;

    const confirmed = window.confirm(
      `CONFIRM CASSETTE DELETION // DOCUMENT #${documentId}\n\n` +
      `Filename: ${documentName || 'Unknown file'}\n\n` +
      `This will delete the database record and associated physical files. Proceed?`
    );
    if (!confirmed) return;

    setDeletingIds(prev => [...prev, documentId]);
    setDeletionNotice(null);
    addLog(`PURGING CASSETTE #${documentId} (${documentName})...`);

    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete document.');
      }

      if (previewDocument?.id === documentId) {
        closePreview();
      }

      if (data.files_cleaned === false) {
        const warningMsg = data.cleanup_warnings?.join('; ') || 'Some physical files could not be removed from storage.';
        setDeletionNotice({
          type: 'warning',
          message: `DOCUMENT #${documentId} PURGED FROM DATABASE, BUT SOME PHYSICAL FILES COULD NOT BE REMOVED: ${warningMsg}`
        });
        addLog(`DELETION PARTIAL // #${documentId} DB RECORD PURGED, DISK FILES INCOMPLETE`);
      } else {
        setDeletionNotice({
          type: 'success',
          message: `DOCUMENT #${documentId} ("${documentName}") AND ALL ASSOCIATED FILES DELETED.`
        });
        addLog(`DELETION OK // #${documentId} CASSETTE PURGED FROM ARCHIVE`);
      }

      await fetchDocuments();
      const statsRes = await fetch('/api/documents/stats');
      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStatsData(statsJson);
      }
    } catch (err) {
      setDeletionNotice({
        type: 'error',
        message: `DOCUMENT #${documentId} DELETION FAILED: ${err.message}`
      });
      addLog(`DELETION FAILED // #${documentId} // ${err.message}`);
    } finally {
      setDeletingIds(prev => prev.filter(id => id !== documentId));
    }
  };

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
    setSelectedCategoryId('');
    setUploadError(null);
    setUploadSuccess(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    addLog('CASSETTE EJECTED FROM INPUT BAY');
  };

  const handleUpload = async () => {
    if (uploading || !selectedFile) return;

    const MAX_SIZE = 15 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      const err = `File size exceeds the 15 MB limit (${formatFileSize(selectedFile.size)}).`;
      setUploadError(err);
      addLog(`REJECTED // ${err}`);
      return;
    }

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
      if (selectedCategoryId) {
        formData.append('category_id', selectedCategoryId);
      }

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
        setSelectedCategoryId('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        addLog(`OK // CASSETTE REGISTERED [ID #${data.document.id}] (${data.document.original_name})`);

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

                  <div style={{ marginTop: '6px' }}>
                    <label className="mono" style={{ fontSize: '10px', color: '#666', display: 'block', marginBottom: '3px' }}>
                      CLASSIFICATION CATEGORY:
                    </label>
                    <select
                      className="console-select"
                      style={{ width: '100%', fontSize: '11px', padding: '5px 8px' }}
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      disabled={uploading}
                    >
                      <option value="">[AUTO / UNASSIGNED]</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

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
                  onClick={() => {
                    const nextVal = !autoDetectScanned;
                    setAutoDetectScanned(nextVal);
                    addLog(`BUS CONFIG // AUTO-DETECT SCANNED: ${nextVal ? 'ARMED' : 'BYPASS'}`);
                  }}
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
                    onClick={() => {
                      const nextVal = !ocrEngineMode;
                      setOcrEngineMode(nextVal);
                      addLog(`BUS CONFIG // OCR CORE: ${nextVal ? 'ENGAGED' : 'DISENGAGED'}`);
                    }}
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

            {deletionNotice && (
              <div
                className={`telemetry-alert ${deletionNotice.type}`}
                role="status"
                style={{ marginTop: '8px', marginBottom: '10px', width: '100%' }}
              >
                {deletionNotice.type === 'success' ? (
                  <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                )}
                <span>{deletionNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setDeletionNotice(null)}
                  aria-label="Dismiss deletion message"
                  style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            )}

            {conversionNotice && (
              <div
                className={`telemetry-alert ${conversionNotice.type}`}
                role={conversionNotice.type === 'error' ? 'alert' : 'status'}
                style={{ marginTop: '8px', marginBottom: '10px', width: '100%' }}
              >
                {conversionNotice.type === 'success'
                  ? <CheckCircle2 size={14} />
                  : <AlertTriangle size={14} />}
                <span>{conversionNotice.message}</span>
                <button
                  type="button"
                  onClick={() => setConversionNotice(null)}
                  aria-label="Dismiss conversion message"
                  style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            )}

            <div className="console-filter-rack">
              <div className="filter-control-group grow">
                <label className="filter-control-label">
                  <Search size={11} />
                  <span>SEARCH REPOSITORY</span>
                </label>
                <div className="console-search-wrapper">
                  <Search size={13} className="console-search-icon" />
                  <input
                    type="text"
                    className="console-input"
                    placeholder="SEARCH BY FILENAME OR EXTRACTED TEXT..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      className="console-search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search input"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="filter-control-group">
                <label className="filter-control-label">
                  <Filter size={11} />
                  <span>STATUS</span>
                </label>
                <select
                  className="console-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">ALL STATUSES</option>
                  <option value="uploaded">UPLOADED</option>
                  <option value="processing">PROCESSING</option>
                  <option value="completed">COMPLETED</option>
                  <option value="failed">FAILED</option>
                </select>
              </div>

              <div className="filter-control-group">
                <label className="filter-control-label">
                  <FileText size={11} />
                  <span>FILE TYPE</span>
                </label>
                <select
                  className="console-select"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="all">ALL TYPES</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">DOCX</option>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </div>

              <div className="filter-control-group">
                <label className="filter-control-label">
                  <Tag size={11} />
                  <span>CATEGORY</span>
                </label>
                <select
                  className="console-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">ALL CATEGORIES</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {(searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all') && (
                <div className="filter-control-group" style={{ alignSelf: 'flex-end' }}>
                  <button
                    type="button"
                    className="tactile-btn"
                    onClick={handleClearFilters}
                    title="Reset all search filters"
                  >
                    <RotateCcw size={12} />
                    <span>RESET</span>
                  </button>
                </div>
              )}
            </div>

            <div className="console-table-container">
              {documentsLoading ? (
                <div style={{ padding: '28px', textAlign: 'center', color: '#5af0a2', fontFamily: "'Chivo Mono', monospace", fontSize: '11px' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <div>SCANNING CASSETTE REPOSITORY...</div>
                </div>
              ) : documentsError ? (
                <div className="telemetry-alert error" style={{ margin: '14px' }}>
                  <AlertTriangle size={14} />
                  <span>{documentsError}</span>
                </div>
              ) : documents.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: '#777', fontFamily: "'Chivo Mono', monospace", fontSize: '11px' }}>
                  {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all' ? (
                    <>
                      <Search size={22} color="#555" style={{ margin: '0 auto 8px' }} />
                      <div>NO CASSETTES MATCH FILTER CRITERIA</div>
                      <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                        Modify query parameters or reset all filters to view repository.
                      </div>
                      <button
                        type="button"
                        className="tactile-btn"
                        style={{ marginTop: '10px' }}
                        onClick={handleClearFilters}
                      >
                        <RotateCcw size={12} />
                        <span>RESET FILTERS</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <FileText size={22} color="#555" style={{ margin: '0 auto 8px' }} />
                      <div>NO CASSETTES IN STORAGE BAY</div>
                      <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                        Insert and ingest a PDF, DOCX, or Image in Bay 01 to populate repository.
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <table className="console-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>ORIGINAL FILENAME</th>
                      <th>CATEGORY</th>
                      <th>TYPE</th>
                      <th>SIZE</th>
                      <th>INGEST STATUS</th>
                      <th>READABILITY</th>
                      <th>RECORDED TIMESTAMP</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td style={{ color: '#5af0a2', fontWeight: 700 }}>#{doc.id}</td>
                        <td style={{ fontWeight: 600, color: '#f7f4ec' }}>{doc.original_name}</td>
                        <td>
                          <span className="cartridge-badge" style={{ background: '#363d38' }}>
                            {doc.category_name || 'GENERAL'}
                          </span>
                        </td>
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
                        <td>
                          {doc.status === 'completed' ? (
                            <span className={`document-readability-tag ${doc.is_scanned ? 'ocr' : 'text'}`}>
                              {doc.is_scanned ? 'OCR' : 'TEXT LAYER'}
                            </span>
                          ) : (
                            <span style={{ color: '#8fa696' }}>—</span>
                          )}
                        </td>
                        <td style={{ color: '#8fa696' }}>{formatDate(doc.created_at)}</td>
                        <td className="document-actions-cell">
                          <div className="document-action-group document-action-group-table">
                            {doc.status === 'completed' ? (
                              <>
                                <button
                                  type="button"
                                  className="tactile-btn document-action-btn"
                                  onClick={() => handleViewText(doc.id)}
                                >
                                  <Eye size={12} />
                                  VIEW TEXT
                                </button>

                                <button
                                  type="button"
                                  className="tactile-btn document-action-btn primary"
                                  onClick={() => handleConvertDocument(doc.id)}
                                  disabled={convertingIds.includes(doc.id)}
                                >
                                  {convertingIds.includes(doc.id)
                                    ? <RefreshCw size={12} className="animate-spin" />
                                    : <FileCheck size={12} />}
                                  {convertingIds.includes(doc.id)
                                    ? 'CONVERTING'
                                    : doc.has_txt_output || doc.has_docx_output
                                      ? 'CHECK / REPAIR'
                                      : 'CONVERT'}
                                </button>

                                {doc.has_txt_output && txtOutputBus && (
                                  <a
                                    className="tactile-btn document-action-btn document-action-link"
                                    href={`/api/documents/${doc.id}/download/txt`}
                                    download
                                    title="Download plain text"
                                  >
                                    <Download size={12} />
                                    TXT
                                  </a>
                                )}

                                {doc.has_docx_output && docxOutputBus && (
                                  <a
                                    className="tactile-btn document-action-btn document-action-link"
                                    href={`/api/documents/${doc.id}/download/docx`}
                                    download
                                    title="Download Word document"
                                  >
                                    <Download size={12} />
                                    DOCX
                                  </a>
                                )}
                              </>
                            ) : (
                              <button
                                type="button"
                                className="tactile-btn document-action-btn primary"
                                onClick={() => handleProcessDocument(doc.id)}
                                disabled={doc.status === 'processing' || processingIds.includes(doc.id)}
                              >
                                <RefreshCw
                                  size={12}
                                  className={processingIds.includes(doc.id) ? 'animate-spin' : ''}
                                />
                                {processingIds.includes(doc.id) || doc.status === 'processing'
                                  ? 'PROCESSING'
                                  : doc.status === 'failed'
                                    ? 'RETRY'
                                    : 'PROCESS'}
                              </button>
                            )}

                            <button
                              type="button"
                              className="tactile-btn document-action-btn danger"
                              onClick={() => handleDeleteDocument(doc.id, doc.original_name)}
                              disabled={deletingIds.includes(doc.id)}
                              title="Delete document cassette"
                            >
                              {deletingIds.includes(doc.id) ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : (
                                <Trash2 size={11} />
                              )}
                              <span>{deletingIds.includes(doc.id) ? 'DELETING' : 'DELETE'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', paddingTop: '8px' }}>
              {processingNotice && (
                <div className={`telemetry-alert ${processingNotice.type}`} style={{ marginTop: '12px' }}>
                  {processingNotice.type === 'success'
                    ? <CheckCircle2 size={14} />
                    : <AlertTriangle size={14} />}
                  <span>{processingNotice.message}</span>
                  <button
                    type="button"
                    onClick={() => setProcessingNotice(null)}
                    aria-label="Dismiss processing message"
                    style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              )}

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
                  onClick={() => alert(`Day 4 Export Bus Verified!\nDocuments in PostgreSQL: ${documents.length}`)}
                >
                  <CheckCircle2 size={14} color="#5af0a2" />
                  <span>DIAGNOSTIC TEST</span>
                </button>
              </div>
            </div>
          </div>

          {previewOpen && (
            <div
              className="document-preview-overlay"
              onMouseDown={event => {
                if (event.target === event.currentTarget) closePreview();
              }}
            >
              <section
                className="document-preview-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="document-preview-title"
              >
                <header className="document-preview-header">
                  <div>
                    <div className="mono document-preview-kicker">READIFY // TEXT INSPECTION</div>
                    <h2 id="document-preview-title">
                      {previewDocument?.original_name || 'DOCUMENT PREVIEW'}
                    </h2>
                  </div>

                  <button
                    type="button"
                    className="tactile-btn"
                    onClick={closePreview}
                    aria-label="Close text preview"
                  >
                    <X size={16} />
                    CLOSE
                  </button>
                </header>

                {previewLoading ? (
                  <div className="document-preview-message">
                    <RefreshCw size={18} className="animate-spin" />
                    LOADING EXTRACTED TEXT...
                  </div>
                ) : previewError ? (
                  <div className="telemetry-alert error">{previewError}</div>
                ) : previewDocument && (
                  <>
                    <div className="document-preview-metadata">
                      <span>STATUS: {previewDocument.status?.toUpperCase()}</span>
                      <span>
                        METHOD: {previewDocument.is_scanned ? 'TESSERACT OCR' : 'TEXT EXTRACTION'}
                      </span>
                      <span>CHARACTERS: {previewDocument.extracted_character_count ?? 0}</span>
                      <span>WORDS: {previewDocument.extracted_word_count ?? 0}</span>
                    </div>

                    {previewDocument.error_message && (
                      <div className="telemetry-alert error">
                        {previewDocument.error_message}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', marginTop: '12px' }}>
                      <div className="mono" style={{ fontSize: '11px', color: '#8fa696', fontWeight: 600 }}>
                        {isEditingText ? 'BUFFER EDIT MODE' : 'INSPECTION BUFFER'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {isEditingText ? (
                          <>
                            <button
                              type="button"
                              className="tactile-btn primary"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                              onClick={handleSaveEditedText}
                              disabled={savingText}
                            >
                              {savingText ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
                              <span>{savingText ? 'SAVING...' : 'SAVE CHANGES'}</span>
                            </button>
                            <button
                              type="button"
                              className="tactile-btn"
                              style={{ fontSize: '11px', padding: '4px 10px' }}
                              onClick={() => {
                                setIsEditingText(false);
                                setEditedTextValue(previewDocument.extracted_text || '');
                                setSaveTextNotice(null);
                              }}
                              disabled={savingText}
                            >
                              <span>CANCEL</span>
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="tactile-btn"
                            style={{ fontSize: '11px', padding: '4px 10px' }}
                            onClick={() => {
                              setEditedTextValue(previewDocument.extracted_text || '');
                              setIsEditingText(true);
                              setSaveTextNotice(null);
                            }}
                          >
                            <Edit3 size={12} />
                            <span>EDIT TEXT</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {saveTextNotice && (
                      <div className={`telemetry-alert ${saveTextNotice.type}`} style={{ marginBottom: '8px' }}>
                        {saveTextNotice.type === 'success' ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                        <span>{saveTextNotice.message}</span>
                        <button
                          type="button"
                          onClick={() => setSaveTextNotice(null)}
                          style={{ marginLeft: 'auto', border: 0, background: 'transparent', cursor: 'pointer' }}
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {isEditingText ? (
                      <textarea
                        className="document-preview-text"
                        style={{
                          width: '100%',
                          minHeight: '220px',
                          resize: 'vertical',
                          outline: 'none',
                          borderColor: '#5af0a2',
                          boxShadow: 'inset 0 0 10px rgba(90, 240, 162, 0.2)'
                        }}
                        value={editedTextValue}
                        onChange={(e) => setEditedTextValue(e.target.value)}
                        placeholder="ENTER OR EDIT EXTRACTED TEXT..."
                      />
                    ) : (
                      <pre className="document-preview-text">
                        {previewDocument.extracted_text || 'NO EXTRACTED TEXT AVAILABLE.'}
                      </pre>
                    )}

                    {previewProcessing?.warnings?.length > 0 && (
                      <div className="telemetry-alert error" style={{ marginTop: '12px' }}>
                        {previewProcessing.warnings.join(' ')}
                      </div>
                    )}

                    <div className="document-preview-export">
                      <div>
                        <div className="mono document-preview-kicker">MACHINE-READABLE OUTPUT BUS</div>
                        <div className="document-preview-export-status">
                          {previewDocument.has_txt_output && previewDocument.has_docx_output
                            ? 'TXT + DOCX OUTPUTS REGISTERED'
                            : 'OUTPUTS NOT GENERATED'}
                        </div>
                      </div>

                      <div className="document-action-group">
                        <button
                          type="button"
                          className="tactile-btn document-action-btn primary"
                          onClick={() => handleConvertDocument(previewDocument.id)}
                          disabled={convertingIds.includes(previewDocument.id)}
                        >
                          {convertingIds.includes(previewDocument.id)
                            ? <RefreshCw size={12} className="animate-spin" />
                            : <FileCheck size={12} />}
                          {convertingIds.includes(previewDocument.id)
                            ? 'CONVERTING'
                            : previewDocument.has_txt_output || previewDocument.has_docx_output
                              ? 'CHECK / REPAIR'
                              : 'CONVERT'}
                        </button>

                        {previewDocument.has_txt_output && txtOutputBus && (
                          <a
                            className="tactile-btn document-action-btn document-action-link"
                            href={`/api/documents/${previewDocument.id}/download/txt`}
                            download
                          >
                            <Download size={12} />
                            DOWNLOAD TXT
                          </a>
                        )}

                        {previewDocument.has_docx_output && docxOutputBus && (
                          <a
                            className="tactile-btn document-action-btn document-action-link"
                            href={`/api/documents/${previewDocument.id}/download/docx`}
                            download
                          >
                            <Download size={12} />
                            DOWNLOAD DOCX
                          </a>
                        )}
                      </div>
                    </div>

                    {conversionNotice?.documentId === previewDocument.id && (
                      <div
                        className={`telemetry-alert ${conversionNotice.type}`}
                        style={{ marginTop: '12px' }}
                      >
                        {conversionNotice.type === 'success'
                          ? <CheckCircle2 size={14} />
                          : <AlertTriangle size={14} />}
                        <span>{conversionNotice.message}</span>
                      </div>
                    )}

                    <section
                      className="document-summary-panel"
                      aria-labelledby="document-summary-title"
                      style={{
                        marginTop: '16px',
                        background: '#232a26',
                        border: '1px solid #3d4a41',
                        borderRadius: '6px',
                        padding: '14px'
                      }}
                    >
                      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <div>
                          <div className="mono document-preview-kicker">TF-IDF ALGORITHMIC CO-PROCESSOR</div>
                          <h3 id="document-summary-title" style={{ fontSize: '13px', fontWeight: 700, color: '#f7f4ec', margin: '2px 0 0 0' }}>
                            AUTO SUMMARY & KEY TAKEAWAYS
                          </h3>
                        </div>

                        <button
                          type="button"
                          className="tactile-btn primary"
                          style={{ fontSize: '11px', padding: '5px 12px' }}
                          onClick={() => handleGenerateSummary(previewDocument.id)}
                          disabled={summaryLoading || !previewDocument.extracted_text}
                        >
                          {summaryLoading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                          <span>{summaryLoading ? 'COMPUTING...' : summaryData ? 'RE-CALCULATE' : 'GENERATE SUMMARY'}</span>
                        </button>
                      </header>

                      <div style={{ fontSize: '10px', color: '#a3b5a7', background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #ffb84d', padding: '5px 8px', borderRadius: '3px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 700, color: '#ffb84d' }}>NOTE:</span> This summary is an algorithmic extraction based on TF-IDF sentence frequency and square-root length scoring, not generative AI. Sentences are mathematically ranked from the source text.
                      </div>

                      {summaryError && (
                        <div className="telemetry-alert error" style={{ margin: '8px 0' }}>
                          <AlertTriangle size={13} />
                          <span>{summaryError}</span>
                        </div>
                      )}

                      {summaryData ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                          <div style={{ background: '#1c221e', borderRadius: '4px', padding: '12px', border: '1px solid #2e3831' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div className="mono" style={{ fontSize: '10px', color: '#5af0a2', fontWeight: 700 }}>
                                AUTO SUMMARY ({summaryData.word_count} WORDS)
                              </div>
                              <span className="mono" style={{ fontSize: '9px', color: '#8fa696', letterSpacing: '0.5px' }}>
                                MATHEMATICAL APPROXIMATION
                              </span>
                            </div>
                            <p style={{ fontSize: '12px', color: '#d8e6da', lineHeight: 1.6, margin: 0 }}>
                              {summaryData.summary_text}
                            </p>
                          </div>

                          {summaryData.key_points && (
                            <div style={{ background: '#1c221e', borderRadius: '4px', padding: '12px', border: '1px solid #2e3831' }}>
                              <div className="mono" style={{ fontSize: '10px', color: '#ffb84d', fontWeight: 700, marginBottom: '6px' }}>
                                KEY TAKEAWAYS
                              </div>
                              <pre style={{ fontSize: '11px', color: '#c7d6c9', fontFamily: "'Chivo Mono', monospace", lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
                                {summaryData.key_points}
                              </pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '11px', color: '#7a8c80', fontFamily: "'Chivo Mono', monospace", padding: '6px 0' }}>
                          NO SUMMARY COMPUTED YET. CLICK "GENERATE SUMMARY" TO RUN TF-IDF SENTENCE SCORING.
                        </div>
                      )}
                    </section>

                    <section
                      className="document-history-panel"
                      aria-labelledby="document-history-title"
                    >
                      <header className="document-history-header">
                        <div>
                          <div className="mono document-preview-kicker">
                            READIFY // ACTIVITY ARCHIVE
                          </div>
                          <h3 id="document-history-title">DOCUMENT HISTORY</h3>
                          <div className="document-history-count">
                            {historyEvents.length} RECORDED EVENTS
                          </div>
                        </div>

                        <button
                          type="button"
                          className="tactile-btn document-action-btn"
                          onClick={() => fetchDocumentHistory(previewDocument.id)}
                          disabled={historyLoading}
                        >
                          <RefreshCw
                            size={12}
                            className={historyLoading ? 'animate-spin' : ''}
                          />
                          REFRESH
                        </button>
                      </header>

                      {historyLoading ? (
                        <div className="document-history-message">
                          <RefreshCw size={15} className="animate-spin" />
                          LOADING ACTIVITY HISTORY...
                        </div>
                      ) : historyError ? (
                        <div className="telemetry-alert error">
                          <AlertTriangle size={14} />
                          {historyError}
                        </div>
                      ) : historyEvents.length === 0 ? (
                        <div className="document-history-message">
                          NO ACTIVITY HAS BEEN RECORDED FOR THIS DOCUMENT.
                        </div>
                      ) : (
                        <ol className="document-history-list">
                          {historyEvents.map(event => (
                            <li
                              key={event.id}
                              className={`document-history-item ${event.event_type}`}
                            >
                              <div className="document-history-event">
                                <div className="document-history-event-heading">
                                  <strong>
                                    {event.event_type.replace(/_/g, ' ').toUpperCase()}
                                  </strong>
                                  <time dateTime={event.created_at}>
                                    {formatDate(event.created_at)}
                                  </time>
                                </div>
                                <p>{event.description}</p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  </>
                )}
              </section>
            </div>
          )}

          <div className="roadmap-container">
            <div className="strip-label">
              <span>5-DAY COLLEGE PROJECT PROGRESSION LOG</span>
              <span className="mono" style={{ fontSize: '10px' }}>DAY 5 OF 5 COMPLETED</span>
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

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 2: INGESTION
                </div>
                <div style={{ fontWeight: 600 }}>File Upload & Multer</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Drag-and-drop, signature validation & PostgreSQL tracking.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 3: CONVERSION
                </div>
                <div style={{ fontWeight: 600 }}>OCR & Extraction</div>
                <div style={{ fontSize: '10px', color: '#666' }}>pdfjs-dist digital text, tesseract.js OCR & mammoth.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
                  DAY 4: EXPORT BUS
                </div>
                <div style={{ fontWeight: 600 }}>TXT & DOCX Output</div>
                <div style={{ fontSize: '10px', color: '#666' }}>Machine-readable document generators & download endpoints.</div>
              </div>

              <div className="step-card">
                <div className="step-header">
                  <span className="led-lamp led-green"></span>
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
