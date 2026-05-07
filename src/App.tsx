/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Mic, Square, Upload, Loader2, Play, RefreshCw, Star, Quote, TrendingUp, Target } from 'lucide-react';

type EvaluationMode = 'excellent' | 'medium' | 'encouraging';

interface ReportData {
  score: number;
  summary: string;
  advantages: string[];
  improvements: string[];
  technicalAnalysis: {
    dimension: string;
    feedback: string;
  }[];
  actionPlan: string[];
}

const MODE_CONFIG = {
  excellent: { label: '优秀', range: '81-95' },
  medium: { label: '中等', range: '61-80' },
  encouraging: { label: '鼓励', range: '40-60' },
};

export default function App() {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<EvaluationMode>('excellent');
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const base64 = base64data.split(',')[1];
          setAudioBase64(base64);
          setMimeType('audio/webm');
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('无法访问麦克风，请检查权限设置。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const base64 = base64data.split(',')[1];
        setAudioBase64(base64);
        setMimeType(file.type || 'audio/mp3');
      };
      setError(null);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const resetAudio = () => {
    setAudioUrl(null);
    setAudioBase64(null);
    setReport(null);
    setError(null);
  };

  const analyzeAudio = async () => {
    if (!name.trim()) {
      setError('请先输入您的姓名。');
      return;
    }
    if (!audioBase64) {
      setError('请先录音或上传录音文件。');
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      
      const apiKey = import.meta.env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
      const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    baseUrl: "https://api.gptsapi.net"
  }
});
      const prompt = `
请你作为一位儒雅、亲切、专业的朗诵名师，对这段朗诵音频进行点评。
当前设定的点评基调为：【${MODE_CONFIG[mode].label}】，请严格将综合评分控制在 ${MODE_CONFIG[mode].range} 分之间。

请严格按照以下 JSON 格式返回结果，不要包含任何 Markdown 标记（如 \`\`\`json），直接返回纯 JSON 字符串：
{
  "score": 数字 (必须在 ${MODE_CONFIG[mode].range} 之间),
  "summary": "用一段话总结本次朗诵的整体印象，明确优缺点。",
  "advantages": ["优势1", "优势2"],
  "improvements": ["改进点1", "改进点2"],
  "technicalAnalysis": [
    { "dimension": "字音基础", "feedback": "吐字归音、普通话标准度点评" },
    { "dimension": "节奏与韵律", "feedback": "停连、重音、语速点评" },
    { "dimension": "声音与气息", "feedback": "气息支撑、共鸣与发音健康度点评" },
    { "dimension": "情感表现力", "feedback": "语境契合度、情感层次感点评" }
  ],
  "actionPlan": ["练习建议1", "练习建议2", "练习建议3"]
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      if (response.text) {
        try {
          const jsonString = response.text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
          const reportData = JSON.parse(jsonString) as ReportData;
          setReport(reportData);
        } catch (parseError) {
          console.error('Error parsing JSON:', parseError, response.text);
          setError('解析报告数据失败，请重试。');
        }
      } else {
        setError('未能生成点评报告，请稍后再试。');
      }
    } catch (err) {
      console.error('Error analyzing audio:', err);
      setError('分析过程中出现错误，请检查网络或稍后再试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col p-6 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-5 border-b-2 border-primary-gold pb-3 shrink-0">
        <h1 className="text-3xl text-text-dark">AI 朗诵名师点评系统</h1>
        <div className="flex items-center gap-3">
          <label htmlFor="name" className="text-lg font-bold">您的姓名：</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={handleNameChange}
            placeholder="请输入..."
            className="px-4 py-2 text-lg border border-border-color rounded-lg bg-white w-48 focus:outline-none focus:ring-2 focus:ring-primary-gold"
          />
        </div>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 flex-1 min-h-0">
        <div className="flex flex-col gap-5">
          <div className="bg-bg-card rounded-2xl p-6 shadow-[0_4px_15px_rgba(0,0,0,0.08)] border border-primary-gold/20 flex flex-col gap-3">
            
            {/* Mode Selection */}
            <div className="mb-2">
              <label className="block text-base font-bold text-text-dark mb-2">选择点评基调：</label>
              <div className="flex bg-white border border-border-color rounded-lg overflow-hidden shadow-sm">
                {(Object.keys(MODE_CONFIG) as EvaluationMode[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className={`flex-1 py-2 text-sm font-bold transition-colors ${
                      mode === key 
                        ? 'bg-primary-gold text-white' 
                        : 'text-text-muted hover:bg-bg-page'
                    }`}
                  >
                    {MODE_CONFIG[key].label}
                    <span className="text-xs font-normal opacity-90 block">{MODE_CONFIG[key].range}分</span>
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-border-color/50 my-2" />

            {/* Audio Controls */}
            {!audioUrl ? (
              <>
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="w-full p-4 text-xl font-bold rounded-xl border-none cursor-pointer flex items-center justify-center gap-3 transition-colors bg-red-600 text-white shadow-md"
                  >
                    <Square size={24} fill="currentColor" />
                    停止录音
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="w-full p-4 text-xl font-bold rounded-xl border-none cursor-pointer flex items-center justify-center gap-3 transition-colors bg-accent-warm text-white shadow-md"
                  >
                    <Mic size={24} />
                    点击开始录音
                  </button>
                )}

                <button
                  onClick={triggerFileInput}
                  disabled={isRecording}
                  className={`w-full p-4 text-xl font-bold rounded-xl cursor-pointer flex items-center justify-center gap-3 transition-colors bg-white border-2 border-accent-warm text-accent-warm shadow-sm ${isRecording ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Upload size={24} />
                  上传音频文件
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="audio/*"
                  className="hidden"
                />
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-2">
                <div className="text-lg text-text-dark font-bold flex items-center gap-2">
                  <Play size={20} className="text-accent-warm" />
                  您的朗诵录音
                </div>
                <audio src={audioUrl} controls className="w-full" />
                <button
                  onClick={resetAudio}
                  className="flex items-center gap-2 text-text-muted hover:text-accent-warm transition-colors mt-1"
                >
                  <RefreshCw size={18} />
                  重新录制/上传
                </button>

                {!report && !loading && (
                  <button
                    onClick={analyzeAudio}
                    className="w-full p-4 text-xl font-bold rounded-xl border-none cursor-pointer flex items-center justify-center gap-3 transition-colors bg-accent-warm text-white mt-2 shadow-md"
                  >
                    请老师点评
                  </button>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-center text-sm">
                {error}
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="mt-4">
                <div className="bg-[#FAFAD2] border border-dashed border-primary-gold p-4 rounded-lg text-base text-text-muted text-center leading-relaxed">
                  <strong>名师正在认真聆听您的诵读...</strong><br/>
                  请稍候，我们正在为您生成深度测评报告。
                </div>
              </div>
            )}
          </div>

          <div className="bg-bg-card rounded-2xl p-6 shadow-[0_4px_15px_rgba(0,0,0,0.08)] border border-primary-gold/20 flex-1 flex flex-col justify-center text-center">
            <p className="text-base text-text-muted italic">
              “诗歌是灵魂的呼吸，朗诵是生命的交响。”
            </p>
          </div>
        </div>

        <div className="bg-bg-card rounded-2xl p-6 shadow-[0_4px_15px_rgba(0,0,0,0.08)] border border-primary-gold/20 overflow-y-auto report-area">
          {report ? (
            <div className="flex flex-col gap-8 animate-in fade-in duration-500 pb-8">
              {/* Header & Score */}
              <div className="flex justify-between items-end border-b border-border-color pb-6">
                <div>
                  <h2 className="text-2xl font-bold text-text-dark">{name} 的朗诵专业测评报告</h2>
                  <p className="text-sm text-text-muted mt-2">
                    测评时间：{new Date().toLocaleDateString()}
                  </p>
                </div>
                <div className="w-24 h-24 border-4 border-primary-gold rounded-full flex flex-col items-center justify-center bg-white shadow-md shrink-0">
                  <span className="text-4xl font-black text-accent-warm leading-none">{report.score}</span>
                  <span className="text-[10px] uppercase text-text-muted mt-1 font-bold">综合评分</span>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white rounded-xl p-6 border border-primary-gold/30 shadow-sm relative overflow-hidden">
                <Quote className="absolute -top-2 -right-2 text-primary-gold/10 w-24 h-24 rotate-12" />
                <h3 className="text-xl font-bold text-text-dark border-l-4 border-primary-gold pl-3 mb-4 relative z-10">朗诵总结</h3>
                <p className="text-lg leading-relaxed text-text-dark relative z-10">{report.summary}</p>
              </div>

              {/* Core Feedback (Left/Right) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/80 rounded-xl p-6 border border-primary-gold/20 shadow-sm">
                  <h3 className="text-lg font-bold text-accent-warm flex items-center gap-2 mb-4 pb-2 border-b border-border-color/50">
                    <Star className="w-5 h-5" /> 主要优势
                  </h3>
                  <ul className="space-y-3">
                    {report.advantages.map((adv, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-dark text-base">
                        <span className="text-primary-gold font-bold mt-0.5">•</span>
                        <span>{adv}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white/80 rounded-xl p-6 border border-primary-gold/20 shadow-sm">
                  <h3 className="text-lg font-bold text-accent-warm flex items-center gap-2 mb-4 pb-2 border-b border-border-color/50">
                    <TrendingUp className="w-5 h-5" /> 改进空间
                  </h3>
                  <ul className="space-y-3">
                    {report.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start gap-2 text-text-dark text-base">
                        <span className="text-primary-gold font-bold mt-0.5">•</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Technical Analysis */}
              <div className="bg-white rounded-xl p-6 border border-primary-gold/30 shadow-sm">
                <h3 className="text-xl font-bold text-text-dark border-l-4 border-primary-gold pl-3 mb-6">详细技术分析</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {report.technicalAnalysis.map((tech, i) => (
                    <div key={i} className="bg-bg-page p-5 rounded-lg border border-border-color/50 hover:shadow-md transition-shadow">
                      <div className="font-bold text-accent-warm mb-2 text-lg">{i + 1}. {tech.dimension}</div>
                      <p className="text-text-dark text-base leading-relaxed">{tech.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Plan */}
              <div className="bg-white rounded-xl p-6 border border-primary-gold/30 shadow-sm">
                <h3 className="text-xl font-bold text-text-dark border-l-4 border-primary-gold pl-3 mb-5 flex items-center gap-2">
                  <Target className="w-6 h-6 text-primary-gold" /> 行动计划
                </h3>
                <ul className="space-y-4">
                  {report.actionPlan.map((plan, i) => (
                    <li key={i} className="flex items-start gap-4 bg-bg-page p-4 rounded-lg border border-border-color/30">
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-gold text-white flex items-center justify-center text-sm font-bold shadow-sm">
                        {i + 1}
                      </span>
                      <span className="text-text-dark text-base pt-1 leading-relaxed">{plan}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted text-lg">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <Loader2 size={48} className="text-primary-gold animate-spin" />
                  <p>正在生成报告...</p>
                </div>
              ) : (
                <p>录制或上传音频后，点击“请老师点评”获取报告。</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
