export default function QualityWarnings({ warnings }: { warnings?: string[] }) {
  if (!warnings?.length) return null;
  return (
    <div role="note" className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 text-xs text-amber-100">
      <p className="font-semibold">成片检测提示</p>
      <p className="mt-1 text-amber-200/80">成片已生成，可以播放和下载。以下为自动检测发现的问题，建议查看成片后判断。</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 leading-relaxed">
        {warnings.map((message, index) => <li key={index}>{message}</li>)}
      </ul>
    </div>
  );
}
