import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>{children}</svg>;
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
  return <Icon {...props}><path d="M2.5 17.8C7.5 19.8 14.5 19.8 21.5 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M4 5.5 10.25 16 13.5 10 20 4v5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /><circle cx="20" cy="4" r="1.5" fill="currentColor" /></Icon>;
}

export function FindryIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><circle cx="11" cy="11" r="6.2" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.6-3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><circle cx="9" cy="10" r="1.1" fill="currentColor" /><circle cx="13.5" cy="9" r="1.1" fill="currentColor" /><circle cx="11" cy="13.5" r="1.1" fill="currentColor" /><path d="M9 10l4.5-1M9 10l2 3.5M13.5 9l-2.5 4.5" stroke="currentColor" strokeWidth="1.1" /></Icon>;
}

export function PasswordIcon(props: SVGProps<SVGSVGElement>) {
  return <Icon {...props}><path d="M12 3l7 2.9v5.6c0 4.5-2.9 7.6-7 9.5-4.1-1.9-7-5-7-9.5V5.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="m8.8 11.8 2.3 2.3 4.4-4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></Icon>;
}
