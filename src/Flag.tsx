// Small local SVG flags render consistently on Windows, including browsers
// whose emoji fonts display regional indicator letters instead of flags.
export function Flag({ code }: { code: string }) {
  const flags: Record<string, React.ReactNode> = {
    US: (
      <>
        <path fill="#fff" d="M0 0h30v20H0z" />
        <path
          stroke="#cb525f"
          strokeWidth="1.6"
          d="M0 1h30M0 4h30M0 7h30M0 10h30M0 13h30M0 16h30M0 19h30"
        />
        <path fill="#53659c" d="M0 0h13v11H0z" />
        <path
          fill="#fff"
          d="M2 2h1v1H2zM5 2h1v1H5zM8 2h1v1H8zM11 2h1v1h-1zM3 5h1v1H3zM6 5h1v1H6zM9 5h1v1H9zM2 8h1v1H2zM5 8h1v1H5zM8 8h1v1H8zM11 8h1v1h-1z"
        />
      </>
    ),
    CA: (
      <>
        <path fill="#fff" d="M0 0h30v20H0z" />
        <path
          fill="#cb525f"
          d="M0 0h7v20H0zM23 0h7v20h-7zM15 3l2 4 2-1-1 4 3 1-5 4v3h-2v-3l-5-4 3-1-1-4 2 1z"
        />
      </>
    ),
    GB: (
      <>
        <path fill="#53659c" d="M0 0h30v20H0z" />
        <path stroke="#fff" strokeWidth="5" d="M0 0l30 20M30 0L0 20" />
        <path stroke="#cb525f" strokeWidth="2" d="M0 0l30 20M30 0L0 20" />
        <path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30" />
        <path stroke="#cb525f" strokeWidth="4" d="M15 0v20M0 10h30" />
      </>
    ),
    AU: (
      <>
        <path fill="#53659c" d="M0 0h30v20H0z" />
        <path
          stroke="#fff"
          strokeWidth="3"
          d="M0 0l14 10M14 0L0 10M7 0v10M0 5h14"
        />
        <path stroke="#cb525f" strokeWidth="1.5" d="M7 0v10M0 5h14" />
        <path
          fill="#fff"
          d="M22 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 13h2v2h-2zM25 12h2v2h-2zM23 17h2v2h-2zM7 14h3v3H7z"
        />
      </>
    ),
    DE: (
      <>
        <path fill="#303344" d="M0 0h30v7H0z" />
        <path fill="#cb525f" d="M0 7h30v6H0z" />
        <path fill="#e2bd65" d="M0 13h30v7H0z" />
      </>
    ),
    NL: (
      <>
        <path fill="#cb525f" d="M0 0h30v7H0z" />
        <path fill="#fff" d="M0 7h30v6H0z" />
        <path fill="#53659c" d="M0 13h30v7H0z" />
      </>
    ),
  };
  return (
    <svg
      className="country-flag"
      viewBox="0 0 30 20"
      aria-label={code}
      role="img"
    >
      {flags[code] || flags.US}
    </svg>
  );
}
