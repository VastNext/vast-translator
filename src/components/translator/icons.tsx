import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>{children}</svg>;
}

export function BrandMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 320 320" fill="none" aria-hidden="true" {...props}>
      <defs>
        <linearGradient id="brand-sunset" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3A7BD5" />
          <stop offset="50%" stopColor="#8A58DC" />
          <stop offset="100%" stopColor="#FF6A88" />
        </linearGradient>
      </defs>
      <rect width="320" height="320" rx="72" fill="url(#brand-sunset)" />
      <path d="M43 73V243L160 127L277 243V73" stroke="#FFFFFF" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M43 73L160 193L277 73" stroke="#FFFFFF" strokeWidth="27" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M87 117L160 193L231 121" stroke="#B6A7F2" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M160 193L228 239" stroke="#78DFC4" strokeWidth="20" strokeLinecap="round" />
    </svg>
  );
}

export function TranslateIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="M4 5h10M9 3v2m3 0c-1 4.2-3.7 7-7 8.5m2.3-5c1.2 2.1 2.9 3.7 5.2 4.8M14 21l3.5-8 3.5 8m-5.8-3h4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

export function SwapIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="m7 7-3 3 3 3m-3-3h15m-2-3 3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" /></Icon>;
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></Icon>;
}

export function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="M5 12h13m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

export function CollapseIcon({ expanded, ...props }: SVGProps<SVGSVGElement> & { expanded: boolean }) {
  return <Icon {...props}><path d={expanded ? "m7 14 5-5 5 5" : "m7 10 5 5 5-5"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

export function RetryIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="M19 8a7 7 0 1 0 1 6M19 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}

export function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 0 1 5 0c1.91-1.3 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></Icon>;
}

export function VastNextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <path d="M8 49C22 43 42 43 56 49" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 24L27 42L44 22" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 42L51 15" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M49 15L55 10L54 18" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="51" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function FindryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" {...props}>
      <defs>
        <mask id="findry-icon-mask">
          <rect width="512" height="512" fill="white" />
          <path
            d="M48 512C58 451 104 403 165 350C213 308 228 270 205 228C192 204 162 190 162 161C162 111 235 97 326 97V54L436 121L326 210V168C275 168 232 178 232 207C232 225 263 240 282 267C320 322 294 374 246 421C207 460 188 485 185 512Z"
            fill="black"
          />
        </mask>
      </defs>
      <path
        d="M100 16H476C496 16 512 32 512 52V101C512 140 481 171 442 171H426V257C426 292 400 320 365 326C325 331 301 349 301 387V488C301 501 290 512 277 512H48V68C48 39 71 16 100 16Z"
        fill="currentColor"
        mask="url(#findry-icon-mask)"
      />
    </svg>
  );
}

export function PasswordIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <path d="M32 10L48 18v14c0 10-7 17-16 22-9-5-16-12-16-22V18L32 10Z" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="m24 32 5 5 12-12" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
