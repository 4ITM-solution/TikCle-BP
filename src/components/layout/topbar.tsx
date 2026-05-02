export function Topbar() {
  return (
    <header
      className="col-span-2 sticky top-0 z-10 flex items-center gap-4 px-5 bg-white border-b"
      style={{ borderColor: "var(--color-g100)" }}
    >
      <div className="w-40">
        <div className="text-[15px] font-extrabold tracking-tight">TikCle BP</div>
        <div
          className="text-[10px] font-semibold uppercase tracking-wider mt-px"
          style={{ color: "var(--color-g400)" }}
        >
          Internal
        </div>
      </div>
      <div className="flex-1" />
      <div
        className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: "var(--color-g200)" }}
      >
        SH
      </div>
    </header>
  );
}
