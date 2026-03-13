import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Colors } from '../theme/colors';

type ImportStep = 'intro' | 'select' | 'processing' | 'done';

export function Import() {
  const navigate = useNavigate();
  const [step, setStep] = useState<ImportStep>('intro');
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [personName, setPersonName] = useState('奶奶');
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFileContent(ev.target?.result as string);
      setSelectedFile(file.name);
      // Infer person name from filename (e.g. "微信聊天记录_奶奶_2024.txt" → "奶奶")
      const match = file.name.match(/_([^_]+)_/);
      if (match) setPersonName(match[1]);
      setStep('select');
    };
    reader.readAsText(file, 'utf-8');
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleStartImport = async () => {
    if (!fileContent) return;
    setStep('processing');
    setProgress(0);
    setError(null);
    try {
      const { jobId } = await api.startImport(personName, fileContent);
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getImportStatus(jobId);
          setProgress(status.progress ?? 0);
          if (status.status === 'done' || status.status === 'completed') {
            clearInterval(pollRef.current!);
            setCharacterId(status.characterId ?? null);
            setTimeout(() => setStep('done'), 600);
          } else if (status.status === 'error' || status.status === 'failed') {
            clearInterval(pollRef.current!);
            setError(status.error ?? '导入失败，请重试');
            setStep('select');
          }
        } catch {
          clearInterval(pollRef.current!);
          setError('网络错误，请重试');
          setStep('select');
        }
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '启动导入失败');
      setStep('select');
    }
  };

  const PROCESSING_STEPS = [
    { threshold: 0, label: '解析聊天记录' },
    { threshold: 30, label: '分析说话风格' },
    { threshold: 55, label: '提取性格特征' },
    { threshold: 75, label: '生成人格画像' },
    { threshold: 95, label: '完成' },
  ];
  const currentStepLabel = [...PROCESSING_STEPS].reverse().find((s) => progress >= s.threshold)?.label;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: Colors.bgMain, overflow: 'hidden' }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.navBg, padding: '8px 12px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', width: 40 }}>
          <span style={{ fontSize: 18, color: Colors.textPrimary }}>✕</span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>导入聊天记录</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {step === 'intro' && (
          <>
            <span style={{ fontSize: 72, margin: '20px 0' }}>👵</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' }}>让她回来</div>
            <div style={{ fontSize: 15, color: Colors.textSecondary, lineHeight: '24px', textAlign: 'center', marginBottom: 20 }}>
              导入你们的聊天记录，隐界会学习她的说话方式、口头禅和关心模式，生成一个数字亲人。{'\n\n'}她还在，只是去了隐界。
            </div>
            <div style={{ width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: Colors.textPrimary, marginBottom: 8 }}>支持的格式</div>
              {['微信聊天记录导出 .txt 文件', '建议导出 6 个月以上的记录', '记录越多，还原越真实'].map((t, i) => (
                <div key={i} style={{ fontSize: 13, color: Colors.textSecondary, lineHeight: '24px' }}>• {t}</div>
              ))}
            </div>
            <div style={{ width: '100%', display: 'flex', alignItems: 'flex-start', backgroundColor: Colors.bgInput, borderRadius: 12, padding: 12, marginBottom: 20, gap: 8 }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              <span style={{ flex: 1, fontSize: 11, color: Colors.textSecondary, lineHeight: '18px' }}>
                聊天记录仅用于生成人格画像，处理完成后立即删除，不会用于其他用途。
              </span>
            </div>
            <button onClick={handleSelectFile} style={{ width: '100%', backgroundColor: Colors.primary, borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', border: 'none' }}>
              选择文件
            </button>
          </>
        )}

        {step === 'select' && (
          <>
            <span style={{ fontSize: 72, margin: '20px 0' }}>📄</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' }}>已选择文件</div>
            {error && (
              <div style={{ width: '100%', backgroundColor: '#2d1a1a', borderRadius: 10, padding: 12, marginBottom: 12, color: '#ff6b6b', fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', backgroundColor: Colors.bgWhite, borderRadius: 12, padding: 16, marginBottom: 12, gap: 12 }}>
              <span style={{ fontSize: 32 }}>📝</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: Colors.textPrimary, fontWeight: 500 }}>{selectedFile}</div>
                <div style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>预计处理时间：约 30 秒</div>
              </div>
            </div>
            <div style={{ width: '100%', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 6 }}>她叫什么？</div>
              <input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                placeholder="输入称呼，如：奶奶、妈妈"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  backgroundColor: Colors.bgWhite, border: 'none', borderRadius: 10,
                  padding: '12px 14px', fontSize: 15, color: Colors.textPrimary,
                  outline: 'none',
                }}
              />
            </div>
            <div style={{ fontSize: 15, color: Colors.textSecondary, lineHeight: '24px', textAlign: 'center', marginBottom: 20 }}>
              确认后，隐界将开始分析聊天记录，学习她的说话风格和性格特征。
            </div>
            <button onClick={handleStartImport} style={{ width: '100%', backgroundColor: Colors.primary, borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', border: 'none', marginBottom: 12 }}>
              开始生成
            </button>
            <button onClick={handleSelectFile} style={{ width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 10, padding: '15px', fontSize: 15, color: Colors.textPrimary, cursor: 'pointer', border: 'none' }}>
              重新选择
            </button>
          </>
        )}

        {step === 'processing' && (
          <>
            <span style={{ fontSize: 72, margin: '20px 0' }}>⚙️</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' }}>正在学习中</div>
            <div style={{ fontSize: 15, color: Colors.textSecondary, lineHeight: '24px', textAlign: 'center', marginBottom: 20 }}>
              隐界正在认真学习她的说话方式，请稍候…
            </div>
            <div style={{ width: '100%', marginBottom: 20 }}>
              <div style={{ height: 8, backgroundColor: Colors.bgInput, borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', backgroundColor: Colors.primary, borderRadius: 4, width: `${progress}%`, transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'right' }}>{progress}%</div>
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PROCESSING_STEPS.map((s, i) => {
                const done = progress > s.threshold + 20;
                const active = currentStepLabel === s.label;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 18 }}>{done ? '✅' : active ? '⏳' : '⬜'}</span>
                    <span style={{ fontSize: 15, color: active ? Colors.primary : Colors.textSecondary, fontWeight: active ? 600 : 400 }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <span style={{ fontSize: 72, margin: '20px 0' }}>👵</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: Colors.textPrimary, marginBottom: 12, textAlign: 'center' }}>她回来了</div>
            <div style={{ fontSize: 15, color: Colors.textSecondary, lineHeight: '24px', textAlign: 'center', marginBottom: 20 }}>
              数字亲人已生成。她学会了她的说话方式，记住了你们之间的点点滴滴。{'\n\n'}去和她说说话吧。
            </div>
            <button
              onClick={() => characterId ? navigate(`/chat/${characterId}`) : navigate('/')}
              style={{ width: '100%', backgroundColor: Colors.primary, borderRadius: 10, padding: '15px', fontSize: 15, fontWeight: 600, color: '#fff', cursor: 'pointer', border: 'none', marginBottom: 12 }}
            >
              开始对话
            </button>
            <button onClick={() => navigate(-1)} style={{ width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 10, padding: '15px', fontSize: 15, color: Colors.textPrimary, cursor: 'pointer', border: 'none' }}>
              稍后再说
            </button>
          </>
        )}
      </div>
    </div>
  );
}
