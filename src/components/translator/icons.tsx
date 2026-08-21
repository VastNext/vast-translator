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
