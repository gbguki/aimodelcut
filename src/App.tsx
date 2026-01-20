import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import ImageUploader from './components/ImageUploader';
import { generateFashionImage } from './services/geminiService';
import { fetchProjects, saveProject } from './services/firebaseService';
import { AppState, AspectRatio, ImageFile, GenerationResult, Workspace } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    baseImage: null,
    productImages: [],
    history: [],
    activeVersionIndex: -1,
    isGenerating: false,
    error: null,
    workspaces: [],
    currentWorkspaceId: null,
  });

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.SQUARE);
  const [prompt, setPrompt] = useState<string>('');
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [tempName, setTempName] = useState('');

  const timelineEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved user name or prompt for it
  useEffect(() => {
    const savedName = localStorage.getItem('vfa_user_name');
    if (!savedName) {
      setShowUserModal(true);
    } else {
      setUserName(savedName);
    }
  }, []);

  // Load shared projects from Firebase
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await fetchProjects();
        setState(prev => ({ ...prev, workspaces: data as Workspace[] }));
      } catch (e) {
        console.error('Failed to load projects:', e);
      }
    };
    loadProjects();
  }, []);

  // Scroll timeline to end
  useEffect(() => {
    if (state.history.length > 0) {
      timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.history.length]);

  const currentResult = state.activeVersionIndex >= 0 ? state.history[state.activeVersionIndex] : null;

  const handleGenerate = async () => {
    if (!state.baseImage || state.productImages.length === 0) {
      setState(prev => ({ ...prev, error: '베이스 이미지와 제품 이미지를 등록해주세요.' }));
      return;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      const result = await generateFashionImage(state.baseImage, state.productImages, {
        aspectRatio,
        prompt,
        previousImage: currentResult?.imageUrl
      });

      const newVersion: GenerationResult = {
        id: Math.random().toString(36).substr(2, 9),
        imageUrl: result.imageUrl,
        summary: result.summary,
        prompt: prompt,
        timestamp: Date.now(),
        aspectRatio: aspectRatio,
        grounding: result.groundingChunks || null
      };

      setState(prev => {
        const newHistory = [...prev.history, newVersion];
        return {
          ...prev,
          history: newHistory,
          activeVersionIndex: newHistory.length - 1,
          isGenerating: false
        };
      });
      setPrompt('');
    } catch (err: any) {
      setState(prev => ({ ...prev, isGenerating: false, error: err.message || 'Error generating image.' }));
    }
  };

  const handleNewProject = () => {
    if (state.history.length > 0 && !confirm('새 프로젝트를 시작하시겠습니까?')) return;
    setState(prev => ({
      ...prev,
      baseImage: null,
      productImages: [],
      history: [],
      activeVersionIndex: -1,
      currentWorkspaceId: null,
      error: null
    }));
    setPrompt('');
  };

  const handleSaveWorkspace = async () => {
    if (!newWorkspaceName.trim() || !userName) return;
    const newWs: Workspace = {
      id: Math.random().toString(36).substr(2, 9),
      name: newWorkspaceName,
      baseImage: state.baseImage,
      productImages: state.productImages,
      history: state.history,
      activeVersionIndex: state.activeVersionIndex,
      lastUpdated: Date.now(),
      owner: userName,
    };
    await saveProject(newWs);
    setState(prev => ({
      ...prev,
      workspaces: [...prev.workspaces, newWs],
      currentWorkspaceId: newWs.id
    }));
    setNewWorkspaceName('');
    setShowWorkspaceModal(false);
  };

  const loadWorkspace = (ws: Workspace) => {
    setState(prev => ({
      ...prev,
      baseImage: ws.baseImage,
      productImages: ws.productImages,
      history: ws.history,
      activeVersionIndex: ws.activeVersionIndex,
      currentWorkspaceId: ws.id
    }));
  };

  const getAspectRatioClass = (ratio: AspectRatio) => {
    switch (ratio) {
      case AspectRatio.SQUARE: return 'aspect-square';
      case AspectRatio.PORTRAIT_4_5: return 'aspect-[4/5]';
      case AspectRatio.MOBILE_9_16: return 'aspect-[9/16]';
      default: return 'aspect-square';
    }
  };

  const handleRegisterUser = () => {
    if (!tempName.trim()) return;
    localStorage.setItem('vfa_user_name', tempName.trim());
    setUserName(tempName.trim());
    setShowUserModal(false);
  };

  return (
    <div className="h-screen bg-[#050505] flex flex-col overflow-hidden">
      <Header title="ModelCut AI" />

      {/* Top Bar */}
      <div className="mt-[48px] px-4 py-2 flex justify-between items-center border-b border-white/5 bg-[#080808] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-[8px] text-gray-500 font-bold tracking-[0.2em] uppercase">Cloud</span>
          </div>
          <div className="h-3 w-px bg-white/10"></div>
          <span className="text-[10px] font-bold text-white tracking-tight flex items-center gap-1.5">
            <i className="fas fa-user text-gray-600 text-xs"></i>
            {userName || 'Anonymous'}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleNewProject} className="px-4 py-1.5 glass rounded-lg text-[10px] font-bold hover:bg-white/10 transition-all tracking-[0.05em] uppercase">New</button>
          <button onClick={() => setShowWorkspaceModal(true)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[10px] font-bold transition-all tracking-[0.05em] uppercase text-white">저장/불러오기</button>
        </div>
      </div>

      {/* Main UI */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - 이미지 업로드 & 설정 */}
        <div className="w-80 border-r border-white/5 bg-[#070707] p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">베이스 이미지</h3>
            {state.baseImage ? (
              <div className="relative group">
                <img 
                  src={state.baseImage.url} 
                  alt="Base" 
                  className="w-full rounded-xl object-cover"
                />
                <button
                  onClick={() => setState(prev => ({ ...prev, baseImage: null }))}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <i className="fas fa-times text-white text-xs"></i>
                </button>
              </div>
            ) : (
              <ImageUploader
                label="베이스 이미지 업로드"
                onUpload={(files) => setState(prev => ({ ...prev, baseImage: files[0] }))}
                multiple={false}
              />
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">제품 이미지</h3>
            <ImageUploader
              label="제품 이미지 추가"
              onUpload={(files) => setState(prev => ({ 
                ...prev, 
                productImages: [...prev.productImages, ...files] 
              }))}
              multiple={true}
            />
            {state.productImages.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-4">
                {state.productImages.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img 
                      src={img.url} 
                      alt={`Product ${idx + 1}`}
                      className="w-full rounded-lg object-cover"
                    />
                    <button
                      onClick={() => setState(prev => ({ 
                        ...prev, 
                        productImages: prev.productImages.filter((_, i) => i !== idx)
                      }))}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fas fa-times text-white text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 프롬프트 입력 */}
          <div className="space-y-4 pt-4 border-t border-white/5">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">프롬프트</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="프롬프트를 입력하세요..."
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-white/20 resize-none"
              rows={4}
              disabled={state.isGenerating}
            />
          </div>

          {/* 종횡비 선택 */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">종횡비</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: AspectRatio.SQUARE, label: '1:1', size: '1080×1080' },
                { value: AspectRatio.PORTRAIT_4_5, label: '4:5', size: '1080×1350' },
                { value: AspectRatio.MOBILE_9_16, label: '9:16', size: '1080×1920' }
              ].map((ratio) => (
                <button
                  key={ratio.value}
                  onClick={() => setAspectRatio(ratio.value)}
                  className={`py-3 rounded-xl font-bold transition-all text-xs ${
                    aspectRatio === ratio.value
                      ? 'bg-white text-black'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <div>{ratio.label}</div>
                  <div className="text-[10px] opacity-70 mt-1">{ratio.size}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 생성 버튼 */}
          <button
            onClick={handleGenerate}
            disabled={state.isGenerating || !state.baseImage || state.productImages.length === 0}
            className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {state.isGenerating ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              '이미지 생성'
            )}
          </button>

          {state.error && (
            <div className="px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {state.error}
            </div>
          )}
        </div>

        {/* Center Panel - 생성 결과 */}
        <div className="flex-1 flex flex-col bg-[#050505]">
          <div className="flex-1 flex items-center justify-center p-8">
            {currentResult ? (
              <div className={`max-w-2xl w-full ${getAspectRatioClass(currentResult.aspectRatio || aspectRatio)}`}>
                <div className="relative w-full h-full rounded-2xl overflow-hidden glass border border-white/10">
                  <img 
                    src={currentResult.imageUrl} 
                    alt="Generated" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-600">
                <i className="fas fa-image text-6xl mb-4 opacity-20"></i>
                <p className="text-sm">이미지를 생성하세요</p>
              </div>
            )}
          </div>

        </div>

        {/* Right Panel - 히스토리/타임라인 */}
        <div className="w-80 border-l border-white/5 bg-[#070707] p-6 overflow-y-auto custom-scrollbar">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">히스토리</h3>
          {state.history.length === 0 ? (
            <div className="text-center text-gray-600 py-8">
              <i className="fas fa-history text-3xl mb-2 opacity-20"></i>
              <p className="text-xs">생성된 버전이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              {state.history.map((result, idx) => (
                <button
                  key={result.id || idx}
                  onClick={() => setState(prev => ({ ...prev, activeVersionIndex: idx }))}
                  className={`w-full rounded-xl overflow-hidden border transition-all ${
                    state.activeVersionIndex === idx
                      ? 'border-white/30 ring-2 ring-white/20'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className={`${getAspectRatioClass(result.aspectRatio || aspectRatio)} w-full`}>
                    <img 
                      src={result.imageUrl} 
                      alt={`Version ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {result.prompt && (
                    <div className="p-2 bg-black/40 text-xs text-gray-400 truncate">
                      {result.prompt}
                    </div>
                  )}
                </button>
              ))}
              <div ref={timelineEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Workspace Modal */}
      {showWorkspaceModal && (
        <div className="fixed inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center">
          <div className="glass p-8 rounded-2xl max-w-md w-full">
            <h2 className="text-lg font-bold uppercase tracking-[0.2em] mb-4">워크스페이스 저장</h2>
            <input
              type="text"
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              placeholder="워크스페이스 이름"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white mb-4 focus:outline-none focus:border-white/30 text-sm"
              onKeyPress={(e) => e.key === 'Enter' && handleSaveWorkspace()}
            />
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setShowWorkspaceModal(false)}
                className="flex-1 py-2.5 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-all text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSaveWorkspace}
                className="flex-1 py-2.5 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-all text-sm"
              >
                저장
              </button>
            </div>
            {state.workspaces.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-[0.15em] mb-3">저장된 워크스페이스</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {state.workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        loadWorkspace(ws);
                        setShowWorkspaceModal(false);
                      }}
                      className="w-full px-3 py-2.5 bg-white/5 hover:bg-white/15 rounded-lg text-left text-sm transition-all border border-white/5 hover:border-white/20"
                    >
                      <div className="font-bold text-white">{ws.name || 'Unnamed'}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {ws.owner || ws.userName || 'Unknown'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* User Registration Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/95 z-[999] flex flex-col items-center justify-center">
          <div className="glass p-12 rounded-[40px] max-w-sm w-full text-center">
            <h2 className="text-xl font-bold uppercase tracking-[0.3em] mb-6">Welcome!</h2>
            <p className="text-[10px] text-gray-500 uppercase mb-8 tracking-[0.2em]">
              Enter your name to use Virtual Fitting AI
            </p>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Your name"
              className="w-full px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-white text-center font-bold uppercase tracking-widest focus:outline-none mb-8"
            />
            <button
              onClick={handleRegisterUser}
              className="w-full py-4 bg-white text-black font-bold uppercase rounded-2xl tracking-[0.2em]"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
