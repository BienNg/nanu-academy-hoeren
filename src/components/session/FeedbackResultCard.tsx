"use client";

import React from "react";
import { ScoreResult } from "@/lib/scoring";
import { SessionClip } from "@/lib/content";

interface FeedbackResultCardProps {
  result: ScoreResult;
  clip: SessionClip;
  onRetry: () => void;
  onNext: () => void;
}

export function FeedbackResultCard({
  result,
  clip,
  onRetry,
  onNext,
}: FeedbackResultCardProps) {
  const isPerfect = result.accuracy === 100;
  const correctWordsCount = result.words.filter(w => w.status === "correct").length;
  const totalScriptWords = result.words.filter(w => w.status !== "extra").length;

  if (isPerfect) {
    return (
      <div className="w-full">
        <div className="w-full bg-surface-container-lowest rounded-3xl p-space-20 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.04),0_2px_8px_-1px_rgba(0,0,0,0.02)] flex flex-col gap-space-16 border border-emerald-100">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-space-4 px-space-12 py-space-4 rounded-full bg-emerald-50 text-emerald-700 font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[18px] text-[#34C759]">check_circle</span>
              <span>Chính xác 100% · Hoàn hảo</span>
            </div>
            <span className="font-caption text-caption text-secondary flex items-center gap-space-2">
              <span className="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
              Đúng {correctWordsCount}/{totalScriptWords} từ
            </span>
          </div>
          
          <p className="text-secondary font-body-sm text-body-sm -mt-space-4">
            Rất tốt! Bạn đã nghe và viết đúng toàn bộ chính tả, ngữ pháp và danh từ viết hoa.
          </p>

          <div className="bg-surface-container-low/70 rounded-2xl p-space-16 flex flex-col gap-space-12 border border-surface-container-high">
            <div className="flex items-start justify-between gap-space-8">
              <p className="text-on-surface font-body-lg text-[18px] leading-relaxed font-medium">
                {clip.script}
              </p>
            </div>
            {clip.translationVi && (
              <>
                <div className="h-px w-full bg-surface-container-high"></div>
                <div className="flex items-start gap-space-8">
                  <span className="material-symbols-outlined text-[18px] text-secondary mt-0.5">translate</span>
                  <p className="font-body-md text-body-md text-secondary italic">
                    “{clip.translationVi}”
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between pt-space-2">
            <div className="flex items-center gap-space-4 text-emerald-700 font-caption text-caption">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Đã chuẩn hóa chính tả & danh từ viết hoa</span>
            </div>
          </div>
        </div>

        {/* Bottom Evaluation Action */}
        <div className="flex flex-col gap-space-12 pt-space-24">
          <div className="grid grid-cols-2 gap-space-12">
            <button
              onClick={onRetry}
              className="h-14 rounded-2xl bg-surface-container-lowest border border-outline-variant/60 text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-space-8 hover:bg-surface-container transition-all active:scale-95 shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[20px]">replay</span>
              <span>Luyện lại</span>
            </button>
            <button
              onClick={onNext}
              className="h-14 rounded-2xl bg-[#0071E3] text-white font-label-lg text-label-lg flex items-center justify-center gap-space-8 hover:bg-[#0071E3]/90 shadow-md transition-all active:scale-95"
              type="button"
            >
              <span>Tiếp theo</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
          <div className="flex items-center justify-center gap-space-4 text-secondary text-center">
            <span className="material-symbols-outlined text-[15px] text-[#34C759]">check_circle</span>
            <p className="font-body-sm text-body-sm text-secondary">Đã lưu kết quả bài nghe vào hồ sơ học tập</p>
          </div>
        </div>
      </div>
    );
  }

  // Partial State
  return (
    <div className="w-full flex flex-col gap-space-16 mt-space-16">
      <section className="bg-surface-container-lowest rounded-[24px] shadow-sm p-space-20 flex flex-col gap-space-16">
        <div className="flex items-center justify-between pb-space-4">
          <div className="flex items-center gap-space-8"></div>
          <div className="flex items-center gap-space-4 bg-primary/10 text-primary px-space-8 py-space-2 rounded-full font-label-sm text-label-sm font-semibold">
            <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
            <span>Độ chính xác: {result.accuracy}%</span>
          </div>
        </div>
        
        <div className="flex flex-col gap-space-8">
          <div className="bg-surface-container-low rounded-2xl p-space-16 text-on-surface font-body-lg text-body-lg leading-relaxed">
            {result.words.map((w, i) => {
              if (w.status === "missing") return null;
              
              if (w.status === "incorrect" || w.status === "extra") {
                return (
                  <React.Fragment key={i}>
                    <span className="relative inline-block text-error font-medium underline decoration-error decoration-wavy underline-offset-4 bg-error-container/40 px-space-4 rounded">
                      {w.typed}
                    </span>
                    <span> </span>
                  </React.Fragment>
                );
              }
              
              return <span key={i}>{w.typed} </span>;
            })}
          </div>
        </div>

        <div className="border-t border-surface-container-high pt-space-16 flex flex-col gap-space-8">
          <div className="flex items-center justify-between">
            <span className="font-caption text-caption text-primary uppercase tracking-wider font-semibold flex items-center gap-space-4">
              <span className="material-symbols-outlined text-[16px]">check_circle</span> Đáp án chuẩn ngữ pháp
            </span>
          </div>
          <div className="bg-primary-fixed/30 rounded-2xl p-space-16 font-body-lg text-body-lg leading-relaxed text-on-surface">
            <p>
              {result.words.map((w, i) => {
                if (w.status === "extra") return null;
                
                if (w.status === "incorrect" || w.status === "missing") {
                  return (
                    <React.Fragment key={i}>
                      <strong className="text-primary font-semibold">{w.word}</strong>
                      <span> </span>
                    </React.Fragment>
                  );
                }

                return <span key={i}>{w.word} </span>;
              })}
            </p>
            {clip.translationVi && (
              <p className="font-body-sm text-body-sm text-secondary pt-space-4 border-t border-surface-container mt-space-8">
                {clip.translationVi}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 4. BOTTOM ACTION ANCHOR: CHECK BUTTON & STATUS */}
      <footer className="mt-space-8 flex flex-col items-center gap-space-8 pb-space-24">
        <div className="grid grid-cols-2 gap-space-12 w-full">
          <button
            onClick={onRetry}
            className="w-full h-13 py-space-12 px-space-16 bg-surface-container-lowest text-primary border-2 border-primary font-label-lg text-label-lg rounded-2xl hover:bg-surface-container active:scale-[0.98] transition-all flex items-center justify-center gap-space-6 shadow-sm"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">replay</span>
            <span>Thử lại · Nochmal</span>
          </button>
          <button
            onClick={onNext}
            className="w-full h-13 py-space-12 px-space-16 bg-primary text-on-primary font-label-lg text-label-lg rounded-2xl shadow-md hover:opacity-95 active:scale-[0.98] transition-all flex items-center justify-center gap-space-6"
            type="button"
          >
            <span>Tiếp theo · Weiter</span>
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
